/**
 * Starts the packaged application and checks that it opens.
 *
 * The smoke suite runs `electron .` against the source tree, which proves the
 * code works and says nothing about what is shipped. The packaged tree was
 * assembled by CI and never started, so anything that breaks only once the app
 * is packaged — a file left out of `files`, a dependency pruned that was needed,
 * a protocol handler that cannot find the renderer — reached a release.
 *
 * That is not hypothetical: the application was shipping 246MB of build tools
 * inside itself, and moving them out was only safe to do because the packaged
 * binary was launched by hand afterwards. This is that check, written down.
 *
 * Run after `electron-builder --dir`.
 */
import { _electron as electron } from 'playwright';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
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
    const tree = trees.find((name) => name.startsWith('mac'));
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

  const tree = trees.find((name) => name.startsWith('linux'));
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
 * licence text and a written offer — none of which a packaged Electron app
 * ships. It was in the tree because `next` depends on sharp and `next` was a
 * runtime dependency; moving the build tools out took it with them.
 *
 * Native modules cannot run from inside an asar, so anything like this is
 * unpacked beside it and a walk of the tree finds it. Checked here so that a
 * dependency change cannot quietly put it back — the obligation is not the kind
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

const binary = packagedBinary();
console.log(`Starting ${path.relative(process.cwd(), binary)}`);

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

// `ELECTRON_RUN_AS_NODE` is set by some editors' terminals and makes the binary
// run as a plain Node process, which fails with a message about nothing.
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

const profile = mkdtempSync(path.join(tmpdir(), 'copacetic-packaged-'));
let app;
let failure = null;

try {
  app = await electron.launch({
    executablePath: binary,
    args: [`--user-data-dir=${profile}`],
    env: environment,
    timeout: 60_000,
  });

  const chrome = await until(async () => app.windows().find((w) => !w.url().includes('/overlay')) ?? null, 45_000);
  if (!chrome) {
    throw new Error('the packaged app never opened a window');
  }

  // The tab strip exists only once the interface has rendered, and the bridge
  // only if the preload was found and loaded — the two things packaging is most
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
