// What a release says about itself: the installers in its manifest, and its notes as plain text.

export interface ManifestFile {
  url: string;
  /** Base64, as electron-builder writes it. */
  sha512: string;
  size: number;
}

/**
 * The files listed in an electron-builder `latest-mac.yml`. Read by pattern
 * rather than by a YAML parser: the file is machine-written in one shape, and
 * adding a dependency to read three keys would ship it inside the app.
 */
export function readManifestFiles(text: string): ManifestFile[] {
  const entries = text.split(/\n\s*-\s+url:\s*/).slice(1);
  return entries
    .map((entry) => {
      const url = /^(\S+)/.exec(entry)?.[1] ?? '';
      const sha512 = /\n\s*sha512:\s*(\S+)/.exec(entry)?.[1] ?? '';
      const size = Number(/\n\s*size:\s*(\d+)/.exec(entry)?.[1] ?? Number.NaN);
      return { url, sha512, size };
    })
    .filter((file) => file.url.endsWith('.dmg') && file.sha512 !== '' && Number.isFinite(file.size));
}

/** The disk image for this Mac: the arm64 one on Apple silicon, the other on Intel. */
export function installerFor(files: readonly ManifestFile[], arch: string): ManifestFile | null {
  const isArm = arch === 'arm64';
  return files.find((file) => file.url.endsWith('-arm64.dmg') === isArm) ?? null;
}

const MAX_NOTES = 1200;

/** A release's Markdown notes as text a pane can show, shortened at a line rather than mid-word. */
export function plainReleaseNotes(markdown: string): string | null {
  const text = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[ \t]*[-*][ \t]+/gm, '· ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) {
    return null;
  }
  if (text.length <= MAX_NOTES) {
    return text;
  }
  const cut = text.lastIndexOf('\n', MAX_NOTES);
  return `${text.slice(0, cut > 0 ? cut : MAX_NOTES).trimEnd()}\n…`;
}
