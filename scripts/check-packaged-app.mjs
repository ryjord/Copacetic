/**
 * Starts the packaged application and checks that it opens.
 *
 * The smoke suite runs `electron .` against the source tree, which proves the
 * code works and says nothing about what is shipped. The packaged tree was
 * assembled by CI and never started, so anything that breaks only once the app
 * is packaged - a file left out of `files`, a dependency pruned that was needed,
 * a protocol handler that cannot find the renderer - reached a release.
 *
 * That is not hypothetical: the application was shipping 246MB of build tools
 * inside itself, and moving them out was only safe to do because the packaged
 * binary was launched by hand afterwards. This is that check, written down.
 *
 * Run after `electron-builder --dir -c.electronFuses.enableNodeCliInspectArguments=true`: Playwright drives
 * the app through the inspector, which the release itself switches off.
 */
// A CommonJS package, so its exports arrive as one default object.
import fuses from '@electron/fuses';
import { _electron as electron } from 'playwright';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RELEASE = path.join(process.cwd(), 'release');

/** Where electron-builder leaves the runnable binary, per platform. */
function packagedBinary() {
  if (!existsSync(RELEASE)) {
    throw new Error('No release/ directory. Run `npx electron-builder --dir --publish never` first.');
  }
  const trees = readdirSync(RELEASE);

  if (process.platform === 'darwin') {
    // Both architectures may be built; the one that can start here is the one for this Mac.
    const native = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
    const tree = trees.find((name) => name === native) ?? trees.find((name) => name.startsWith('mac'));
    if (!tree) {
      throw new Error(`No mac tree in release/: ${trees.join(', ')}`);
    }
    const app = readdirSync(path.join(RELEASE, tree)).find((name) => name.endsWith('.app'));
    if (!app) {
      throw new Error(`No .app in release/${tree}`);
    }
    return path.join(RELEASE, tree, app, 'Contents', 'MacOS', app.replace(/\.app$/, ''));
  }

  if (process.platform === 'win32') {
    const tree = trees.find((name) => name.startsWith('win'));
    if (!tree) {
      throw new Error(`No win tree in release/: ${trees.join(', ')}`);
    }
    const exe = readdirSync(path.join(RELEASE, tree)).find((name) => name.endsWith('.exe'));
    if (!exe) {
      throw new Error(`No .exe in release/${tree}`);
    }
    return path.join(RELEASE, tree, exe);
  }

  // Both architectures may be unpacked; only this machine's own can be started.
  const tree = trees.find((name) => name === (process.arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked'));
  if (!tree) {
    throw new Error(`No linux tree in release/: ${trees.join(', ')}`);
  }
  const binary = readdirSync(path.join(RELEASE, tree)).find((name) => name.toLowerCase() === 'copacetic');
  if (!binary) {
    throw new Error(`No binary in release/${tree}`);
  }
  return path.join(RELEASE, tree, binary);
}

const until = async (answer, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await answer().catch(() => null);
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
};

/**
 * Native code that carries an obligation the shipped app does not meet.
 *
 * libvips, which arrives inside sharp, is LGPL. Section 4 of that licence wants
 * either dynamic linking with a way to relink, or the object files, plus the
 * licence text and a written offer - none of which a packaged Electron app
 * ships. It was in the tree because `next` depends on sharp and `next` was a
 * runtime dependency; moving the build tools out took it with them.
 *
 * Native modules cannot run from inside an asar, so anything like this is
 * unpacked beside it and a walk of the tree finds it. Checked here so that a
 * dependency change cannot quietly put it back - the obligation is not the kind
 * of thing anyone notices returning.
 */
const COPYLEFT_NATIVES = ['sharp', 'libvips'];

function copyleftNativesIn(root) {
  const found = [];
  const walk = (directory, depth) => {
    if (depth > 8) {
      return;
    }
    let entries;
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(directory, entry);
      if (COPYLEFT_NATIVES.some((name) => entry.toLowerCase().includes(name))) {
        found.push(path.relative(root, full));
        continue;
      }
      let isDirectory = false;
      try {
        isDirectory = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDirectory) {
        walk(full, depth + 1);
      }
    }
  };
  walk(root, 0);
  return found;
}

const { FuseV1Options, getCurrentFuseWire } = fuses;
// The wire's own bytes, ASCII 1 and 0; the package does not export its names for them.
const FuseState = { ENABLE: 49, DISABLE: 48 };
const binary = packagedBinary();
console.log(`Starting ${path.relative(process.cwd(), binary)}`);

/**
 * The switches compiled into the Electron binary, read back from it rather than
 * trusted from the config: each closes a way to run code as Copacetic that
 * does not go through Copacetic, such as ELECTRON_RUN_AS_NODE or a loose app
 * folder beside the archive.
 */
const EXPECTED_FUSES = {
  [FuseV1Options.RunAsNode]: FuseState.DISABLE,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: FuseState.DISABLE,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: FuseState.ENABLE,
  [FuseV1Options.OnlyLoadAppFromAsar]: FuseState.ENABLE,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: FuseState.DISABLE,
};
const wire = await getCurrentFuseWire(binary);
const wrongFuses = Object.entries(EXPECTED_FUSES)
  .filter(([fuse, state]) => wire[fuse] !== state)
  .map(([fuse]) => FuseV1Options[fuse]);
if (wrongFuses.length > 0) {
  console.error(`\nThe packaged binary has these fuses in the wrong state: ${wrongFuses.join(', ')}.`);
  process.exit(1);
}
console.log('The packaged binary has its fuses set.');

const shippedTree =
  process.platform === 'darwin' ? path.dirname(path.dirname(path.dirname(binary))) : path.dirname(binary);
const copyleft = copyleftNativesIn(shippedTree);
if (copyleft.length > 0) {
  console.error('\nThe packaged app ships native code with a licence obligation it does not meet:');
  for (const entry of copyleft.slice(0, 10)) {
    console.error(`  ${entry}`);
  }
  console.error('See NOTICE, and CI-067 in the audit. Nothing in the main process needs these.');
  process.exit(1);
}
console.log('No copyleft native code in the packaged tree.');

/**
 * What macOS needs before it will let a site use a device.
 *
 * Without a usage string the request fails with no prompt at all, and the
 * person sees a site that simply cannot find a camera: the permission banner
 * said yes and nothing happened.
 */
const MAC_USAGE_STRINGS = [
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSLocationUsageDescription',
  'NSScreenCaptureUsageDescription',
];

if (process.platform === 'darwin') {
  // Setting the fuses rewrites Electron Framework after it was signed. A runner's
  // macOS can still start such an app while a newer one kills it at launch, as
  // 2.0.0-beta.2 was, so the signature is checked rather than the launch.
  const signature = spawnSync('codesign', ['--verify', '--deep', '--strict', shippedTree], { encoding: 'utf8' });
  if (signature.status !== 0) {
    console.error(
      `\nThe packaged app's signature does not hold, so macOS will refuse to run it:\n${signature.stderr}`,
    );
    process.exit(1);
  }
  console.log('The packaged app is signed as a whole, after its fuses were set.');

  const plist = readFileSync(path.join(shippedTree, 'Contents', 'Info.plist'), 'utf8');
  const missing = MAC_USAGE_STRINGS.filter((key) => !plist.includes(`<key>${key}</key>`));
  if (missing.length > 0) {
    console.error(`\nThe packaged app cannot ask macOS for a device: Info.plist has no ${missing.join(', ')}.`);
    process.exit(1);
  }
  console.log('Info.plist says why each device is asked for.');

  // electron-builder drops the page on macOS; the build puts it in Resources for the Licences screen.
  if (!existsSync(path.join(shippedTree, 'Contents', 'Resources', 'LICENSES.chromium.html'))) {
    console.error("\nThe packaged app is missing Chromium's licences, which it must carry.");
    process.exit(1);
  }
  console.log("The packaged app carries Chromium's licences.");
}

// `ELECTRON_RUN_AS_NODE` is set by some editors' terminals and makes the binary
// run as a plain Node process, which fails with a message about nothing.
const environment = { ...process.env, COPACETIC_LAUNCH_IN_BACKGROUND: '1' };
delete environment.ELECTRON_RUN_AS_NODE;
// The AppImage runtime sets this, and it is what makes a Linux build update itself; the tree stands in for one.
if (process.platform === 'linux') {
  environment.APPIMAGE = binary;
}

/**
 * A release feed on this machine offering a version far ahead of this one.
 *
 * electron-updater loads only in a packaged build, so nothing else in the suite
 * ever ran it, and it was broken for twelve releases with every test green. The
 * feed answers every channel's file, since a beta asks for beta.yml; asking for
 * the installer named in it is the proof the updater loaded, read the feed and
 * decided it was newer. The download then fails its checksum, which is fine.
 */
async function startUpdateFeed() {
  const installer = process.platform === 'win32' ? 'Copacetic-Setup-99.0.0.exe' : 'Copacetic-99.0.0.AppImage';
  const feed = [
    'version: 99.0.0',
    'files:',
    `  - url: ${installer}`,
    '    sha512: AAAA',
    '    size: 4',
    `path: ${installer}`,
    'sha512: AAAA',
    "releaseDate: '2026-01-01T00:00:00.000Z'",
    '',
  ].join('\n');
  const requested = [];
  const server = createServer((request, response) => {
    // The updater adds a cache-busting query, so the file is matched by its path alone.
    const requestedPath = new URL(request.url ?? '/', 'http://feed').pathname;
    requested.push(requestedPath);
    if (requestedPath.endsWith('.yml')) {
      response.writeHead(200, { 'content-type': 'text/yaml' }).end(feed);
      return;
    }
    response.writeHead(200).end('nope');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}/`, requested, installer, close: () => server.close() };
}

const profile = mkdtempSync(path.join(tmpdir(), 'copacetic-packaged-'));
let app;
let failure = null;

try {
  app = await electron.launch({
    executablePath: binary,
    args: [`--user-data-dir=${profile}`],
    env: environment,
    timeout: 60_000,
    colorScheme: null,
    // Sandboxed as an installed copy runs; Playwright adds --no-sandbox on Linux otherwise.
    chromiumSandbox: true,
  });

  const chrome = await until(async () => app.windows().find((w) => !w.url().includes('/overlay')) ?? null, 45_000);
  if (!chrome) {
    throw new Error('the packaged app never opened a window');
  }

  // The tab strip exists only once the interface has rendered, and the bridge
  // only if the preload was found and loaded - the two things packaging is most
  // likely to break.
  const ready = await until(() => chrome.evaluate(() => Boolean(document.querySelector('[role="tablist"]'))), 45_000);
  if (!ready) {
    throw new Error('the packaged app opened a window that never rendered its interface');
  }

  const hasBridge = await chrome.evaluate(() => typeof window.copacetic === 'object');
  if (!hasBridge) {
    throw new Error('the packaged app rendered, but its preload bridge is missing');
  }

  console.log('The packaged app starts, renders its interface, and has its bridge.');

  // The database engine is Electron's own, so only the shipped binary can say it opens, migrates and searches.
  const history = await chrome.evaluate(() => window.copacetic.history.list('anything'));
  if (!existsSync(path.join(profile, 'copacetic.db')) || typeof history?.total !== 'number') {
    throw new Error('the packaged app has no working history database');
  }
  console.log('The packaged app opened its database and searched it.');

  // macOS is updated by hand until the builds are signed, so there is no updater there to exercise.
  if (process.platform !== 'darwin') {
    const feed = await startUpdateFeed();
    // The NSIS installer writes this beside the app and the Windows updater reads it before downloading;
    // an unpacked tree has none, so the check writes the one an install would carry.
    const updateConfig = path.join(path.dirname(binary), 'resources', 'app-update.yml');
    const isWritingUpdateConfig = process.platform === 'win32' && !existsSync(updateConfig);
    if (isWritingUpdateConfig) {
      writeFileSync(updateConfig, `provider: generic\nurl: ${feed.url}\nupdaterCacheDirName: copacetic-updater\n`);
    }
    try {
      await app.evaluate((_electron, url) => {
        const { autoUpdater } = process.mainModule.require('electron-updater');
        autoUpdater.setFeedURL({ provider: 'generic', url });
      }, feed.url);
      await chrome.evaluate(() => window.copacetic.updates.check());
      const askedForInstaller = await until(
        async () => feed.requested.some((request) => request.includes(feed.installer.replace(/\.[^.]+$/, ''))),
        45_000,
      );
      if (!askedForInstaller) {
        const status = await chrome.evaluate(async () => (await window.copacetic.chrome.getState()).update.status);
        throw new Error(
          `the updater never asked for the newer build (asked for ${feed.requested.join(', ') || 'nothing'}; status ${JSON.stringify(status)})`,
        );
      }
      console.log(
        `The updater loaded, read the feed (${feed.requested.find((request) => request.endsWith('.yml'))}) and fetched the newer build.`,
      );
    } finally {
      feed.close();
      if (isWritingUpdateConfig) {
        rmSync(updateConfig, { force: true });
      }
    }
  }
} catch (error) {
  failure = error;
} finally {
  await app?.close().catch(() => {});
  rmSync(profile, { recursive: true, force: true });
}

if (failure) {
  console.error(`\nThe packaged app did not start: ${failure instanceof Error ? failure.message : String(failure)}`);
  process.exit(1);
}
