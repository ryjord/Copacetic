/**
 * Installs each installer the way a person would, starts what it installed,
 * and takes it away again.
 *
 * check-packaged-app.mjs starts the unpacked tree, which says nothing about
 * what an installer does around it. Two things only an install shows: the
 * .deb's own after-install script once replaced electron-builder's, so the
 * package went in with no /usr/bin link, no sandbox permissions and no AppArmor
 * profile, and a clean Ubuntu 24.04 cannot start Chromium without the last.
 * Nobody had run the .exe, .deb or AppImage on a clean machine to see it.
 *
 * Run after `electron-builder --publish never`, on the platform being checked.
 * It changes the machine: on Linux through sudo and apt, on Windows through the
 * installer. CI only.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RELEASE = path.join(process.cwd(), 'release');
const STARTUP_TIMEOUT_MS = 60_000;

const installers = (pattern) => readdirSync(RELEASE).filter((name) => pattern.test(name));

function only(pattern) {
  const found = installers(pattern);
  if (found.length !== 1) {
    throw new Error(`Expected one installer matching ${pattern} in release/, found: ${found.join(', ') || 'none'}`);
  }
  return path.join(RELEASE, found[0]);
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

/** Started with a profile of its own, and counted as working once it has written its database. */
async function startsAndStays(binary, extraArgs = []) {
  const profile = mkdtempSync(path.join(tmpdir(), 'copacetic-installed-'));
  const child = spawn(binary, [`--user-data-dir=${profile}`, ...extraArgs], { stdio: 'inherit' });
  let exitCode = null;
  child.on('exit', (code) => (exitCode = code ?? -1));
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline && exitCode === null && !existsSync(path.join(profile, 'copacetic.db'))) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // A few seconds more, so a crash just after the database opens is still seen.
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const hasDatabase = existsSync(path.join(profile, 'copacetic.db'));
  const isRunning = exitCode === null;
  child.kill();
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/F', '/T', '/IM', path.basename(binary)], { stdio: 'ignore' });
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  rmSync(profile, { recursive: true, force: true });
  if (!hasDatabase || !isRunning) {
    throw new Error(`${binary} did not start and stay up (database: ${hasDatabase}, exit code: ${exitCode})`);
  }
  console.log(`${binary} started and stayed up.`);
}

const mustExist = (file, why) => {
  if (!existsSync(file)) {
    throw new Error(`${file} is missing: ${why}`);
  }
};

const mustBeGone = async (file, why) => {
  const deadline = Date.now() + 30_000;
  while (existsSync(file) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (existsSync(file)) {
    throw new Error(`${file} is still there: ${why}`);
  }
};

async function checkDeb() {
  const deb = only(/^copacetic_.*_amd64\.deb$/);
  run('sudo', ['apt-get', 'install', '-y', deb]);
  mustExist('/opt/Copacetic/copacetic', 'the package installs the app to /opt');
  mustExist('/usr/bin/copacetic', 'electron-builder links the binary into /usr/bin');
  mustExist('/usr/share/applications/copacetic.desktop', 'the menu entry and the default-browser registration');
  const isAppArmorOn = spawnSync('sudo', ['apparmor_status', '--enabled']).status === 0;
  if (isAppArmorOn) {
    mustExist('/etc/apparmor.d/copacetic', "Ubuntu 24.04 needs the profile before Chromium's sandbox can start");
  }
  await startsAndStays('/usr/bin/copacetic');
  run('sudo', ['apt-get', 'remove', '-y', 'copacetic']);
  await mustBeGone('/usr/bin/copacetic', 'removing the package takes its link away');
  await mustBeGone('/etc/apparmor.d/copacetic', 'removing the package takes its AppArmor profile away');
  run('sudo', ['apt-get', 'purge', '-y', 'copacetic']);
}

async function checkAppImage() {
  const appImage = only(/^Copacetic-.*\.AppImage$/);
  // Ubuntu 24.04 ships without the FUSE 2 library an AppImage mounts itself with; the README says so.
  run('sudo', ['apt-get', 'install', '-y', 'libfuse2t64']);
  run('chmod', ['+x', appImage]);
  await startsAndStays(appImage);
}

async function checkWindows() {
  // Spaces as electron-builder writes it, dashes as GitHub serves it.
  const setup = only(/^Copacetic[ -]Setup[ -].*\.exe$/);
  // The per-user, one-click installer: no administrator, the way most people will install it.
  run(setup, ['/S']);
  const programs = path.join(process.env.LOCALAPPDATA ?? '', 'Programs');
  const folder = readdirSync(programs).find((name) => existsSync(path.join(programs, name, 'Copacetic.exe')));
  if (!folder) {
    throw new Error(`Copacetic.exe was not installed under ${programs}`);
  }
  const installed = path.join(programs, folder);
  await startsAndStays(path.join(installed, 'Copacetic.exe'));
  const uninstaller = readdirSync(installed).find((name) => /^Uninstall .*\.exe$/.test(name));
  if (!uninstaller) {
    throw new Error(`No uninstaller in ${installed}`);
  }
  run(path.join(installed, uninstaller), ['/S']);
  // The uninstaller copies itself elsewhere and carries on after it returns.
  await mustBeGone(path.join(installed, 'Copacetic.exe'), 'uninstalling removes the app');
}

async function checkMac() {
  const native = process.arch === 'arm64' ? /^Copacetic-.*-arm64\.dmg$/ : /^Copacetic-\d[^-]*(-[a-z]+\.\d+)?\.dmg$/;
  const dmg = only(native);
  const mount = mkdtempSync(path.join(tmpdir(), 'copacetic-dmg-'));
  const applications = mkdtempSync(path.join(tmpdir(), 'copacetic-applications-'));
  run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg]);
  try {
    // Dragged to Applications is a copy, which is what this does.
    run('ditto', [path.join(mount, 'Copacetic.app'), path.join(applications, 'Copacetic.app')]);
  } finally {
    run('hdiutil', ['detach', mount]);
  }
  run('codesign', ['--verify', '--deep', '--strict', path.join(applications, 'Copacetic.app')]);
  await startsAndStays(path.join(applications, 'Copacetic.app', 'Contents', 'MacOS', 'Copacetic'));
  rmSync(applications, { recursive: true, force: true });
}

if (process.platform === 'linux') {
  await checkDeb();
  await checkAppImage();
} else if (process.platform === 'win32') {
  await checkWindows();
} else {
  await checkMac();
}
console.log('Every installer installed, started and went away again.');
