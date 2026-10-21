// Utils
import { abilitiesOf } from '../../shared/extensions/abilities';

/** A store extension as it stands, for asking the store whether there is a newer one. */
export interface InstalledVersion {
  id: string;
  version: string;
}

/** What an extension may do, which an update must not add to without asking. */
export interface Asked {
  permissions: readonly string[];
  hostPermissions: readonly string[];
}

// The answer for a few dozen extensions is a few kilobytes.
export const MOST_UPDATE_CHECK_BYTES = 1024 * 1024;

/** One question for every store extension at once, as Chrome asks it. */
export function updateCheckUrl(installed: readonly InstalledVersion[], chromiumVersion: string): string {
  const query = new URLSearchParams({ response: 'updatecheck', prodversion: chromiumVersion, acceptformat: 'crx3' });
  installed.forEach(({ id, version }) => query.append('x', `id=${id}&v=${version}&uc`));
  return `https://clients2.google.com/service/update2/crx?${query.toString()}`;
}

const attributesOf = (tag: string): Map<string, string> =>
  new Map([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name = '', value = '']) => [name, value]));

/** The extensions the store offers a newer version of, read from its answer and checked against ours. */
export function idsWithNewerVersions(answer: string, installed: readonly InstalledVersion[]): string[] {
  const current = new Map(installed.map(({ id, version }) => [id, version]));
  const apps = [...answer.matchAll(/<app\b([^>]*?)(?:\/>|>([\s\S]*?)<\/app>)/g)];
  return apps.flatMap(([, app = '', inner = '']) => {
    const id = attributesOf(app).get('appid') ?? '';
    const check = attributesOf(/<updatecheck\b([^>]*)\/?>/.exec(inner)?.[1] ?? '');
    const version = check.get('version') ?? '';
    const was = current.get(id);
    return check.get('status') === 'ok' && was !== undefined && isNewerExtensionVersion(version, was) ? [id] : [];
  });
}

// Up to four dotted numbers, unlike Copacetic's own in shared/version.ts; a missing one counts as 0.
export function isNewerExtensionVersion(offered: string, current: string): boolean {
  const parts = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10));
  const offeredParts = parts(offered);
  const currentParts = parts(current);
  if ([...offeredParts, ...currentParts].some((part) => !Number.isFinite(part))) {
    return false;
  }
  const length = Math.max(offeredParts.length, currentParts.length);
  const difference = Array.from(
    { length },
    (_unused, index) => (offeredParts[index] ?? 0) - (currentParts[index] ?? 0),
  ).find((step) => step !== 0);
  return (difference ?? 0) > 0;
}

/** Whether an update asks for anything Chrome would warn about that the version in use did not, as Chrome decides. */
export function asksForMore(before: Asked, after: Asked): boolean {
  const had = new Set(abilitiesOf(before.permissions, before.hostPermissions));
  return abilitiesOf(after.permissions, after.hostPermissions).some((ability) => !had.has(ability));
}
