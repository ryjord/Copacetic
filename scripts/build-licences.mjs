/**
 * Writes the licence of every package that ships inside Copacetic, for the
 * Licences list in Settings.
 *
 * Shipping means two things here. The main process's production dependencies
 * are copied into the app whole. The renderer's libraries are devDependencies,
 * because Next bundles them, but their code is in the app all the same; they
 * are found by reading what `src/` actually imports, so a library added there
 * is listed without anyone remembering to add it. Each one's own dependencies
 * are walked the way Node resolves them.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not .pathname: on Windows the latter is /D:/..., which is no path at all.
const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'public', 'licences.json');
const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** `react-dom/client` and `@radix-ui/react-dialog/dist` are the packages `react-dom` and `@radix-ui/react-dialog`. */
function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function rendererImports() {
  const specifiers = sourceFiles(path.join(root, 'src')).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)].map((match) => match[1]),
  );
  return specifiers
    .filter(
      (specifier) => !specifier.startsWith('.') && !specifier.startsWith('@/') && !specifier.startsWith('@shared/'),
    )
    .map(packageOf);
}

/** Where Node would find a package asked for from `fromDirectory`: nearest node_modules first. */
function resolvePackage(name, fromDirectory) {
  let directory = fromDirectory;
  while (true) {
    const candidate = path.join(directory, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

function licenceName(manifest) {
  const licence = manifest.license ?? manifest.licenses;
  if (typeof licence === 'string') {
    return licence;
  }
  if (Array.isArray(licence)) {
    return licence.map((entry) => entry.type ?? String(entry)).join(' OR ');
  }
  return licence?.type ?? 'Unknown';
}

function licenceText(directory) {
  const files = readdirSync(directory)
    .filter((name) => LICENCE_FILE.test(name))
    .sort();
  return files.map((name) => readFileSync(path.join(directory, name), 'utf8').trim()).join('\n\n');
}

const packageManifest = readJson(path.join(root, 'package.json'));
const roots = [...new Set([...Object.keys(packageManifest.dependencies ?? {}), ...rendererImports()])];

const found = new Map();
const visit = (name, fromDirectory) => {
  const directory = resolvePackage(name, fromDirectory);
  if (!directory || found.has(directory)) {
    return;
  }
  const manifest = readJson(path.join(directory, 'package.json'));
  found.set(directory, {
    name: manifest.name ?? name,
    version: manifest.version ?? '',
    licence: licenceName(manifest),
    text: licenceText(directory),
  });
  Object.keys(manifest.dependencies ?? {}).forEach((dependency) => visit(dependency, directory));
};
roots.forEach((name) => visit(name, root));

// The electron package is only the downloader; what ships is the runtime, under the same licence.
const electronManifest = readJson(path.join(root, 'node_modules', 'electron', 'package.json'));
found.set('electron-runtime', {
  name: 'Electron',
  version: electronManifest.version,
  licence: 'MIT',
  // The package carries the runtime's licence too, and is there before the runtime is downloaded.
  text: readFileSync(path.join(root, 'node_modules', 'electron', 'LICENSE'), 'utf8').trim(),
});

// A devDependency, so no walk finds it, but its worker ships: copied into the build, and changed there.
const bergamotManifest = readJson(
  path.join(root, 'node_modules', '@browsermt', 'bergamot-translator', 'package.json'),
);
found.set('bergamot-translator', {
  name: bergamotManifest.name,
  version: bergamotManifest.version,
  licence: licenceName(bergamotManifest),
  // The package carries no licence file of its own; MPL-2.0 is the text its manifest names.
  text: readFileSync(path.join(root, 'licences', 'MPL-2.0.txt'), 'utf8').trim(),
});

const packages = [...found.values()]
  .filter(
    (entry, index, all) =>
      all.findIndex((other) => other.name === entry.name && other.version === entry.version) === index,
  )
  .sort((aEntry, bEntry) => aEntry.name.localeCompare(bEntry.name) || aEntry.version.localeCompare(bEntry.version));

mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify({ own: readFileSync(path.join(root, 'LICENSE'), 'utf8').trim(), notice: readFileSync(path.join(root, 'NOTICE'), 'utf8').trim(), packages })}\n`,
);
process.stdout.write(`Wrote the licences of ${packages.length} packages.\n`);
