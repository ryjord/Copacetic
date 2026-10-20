// Libs
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Utils
import { isRecord } from '../data/persistence';
import { t } from '../../shared/i18n/translate';

/** The parts of a manifest Copacetic reads; everything else is left to Chromium. */
export interface Manifest {
  name: string;
  version: string;
  description: string;
  permissions: string[];
  hostPermissions: string[];
  /** The toolbar button, from `action`. */
  action: { title: string; popup: string | null; icon: string | null } | null;
  /** The largest icon the manifest names, as a path inside the extension. */
  icon: string | null;
  raw: Record<string, unknown>;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** The largest of the sizes in an icon map, or the one path given on its own. */
function largestIcon(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (!isRecord(value)) {
    return null;
  }
  const sizes = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .toSorted(([aSize], [bSize]) => Number(bSize) - Number(aSize));
  return sizes[0]?.[1] ?? null;
}

/**
 * Reads a Manifest V3 extension's manifest from its folder, resolving
 * `__MSG_name__` from the extension's own default locale. Throws with a
 * sentence a person can be shown.
 */
export function readManifest(folder: string): Manifest {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.join(folder, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
  } catch {
    throw new Error(t('main.extensions.install.badManifest'));
  }
  if (!isRecord(raw)) {
    throw new Error(t('main.extensions.install.badManifest'));
  }
  if (raw.manifest_version !== 3) {
    throw new Error(t('main.extensions.install.notMv3'));
  }
  const message = localiser(folder, typeof raw.default_locale === 'string' ? raw.default_locale : null);
  const action = isRecord(raw.action) ? raw.action : null;
  const name = message(typeof raw.name === 'string' ? raw.name : '');
  if (!name || typeof raw.version !== 'string') {
    throw new Error(t('main.extensions.install.badManifest'));
  }
  return {
    name,
    version: raw.version,
    description: message(typeof raw.description === 'string' ? raw.description : ''),
    permissions: strings(raw.permissions),
    hostPermissions: [...strings(raw.host_permissions), ...contentScriptMatches(raw.content_scripts)],
    action: action
      ? {
          title: message(typeof action.default_title === 'string' ? action.default_title : name),
          popup: typeof action.default_popup === 'string' ? action.default_popup.replace(/^\//, '') : null,
          icon: largestIcon(action.default_icon),
        }
      : null,
    icon: largestIcon(raw.icons) ?? largestIcon(action?.default_icon),
    raw,
  };
}

/** Content scripts reach pages just as host permissions do, so their sites are shown as well. */
function contentScriptMatches(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.flatMap((script) => (isRecord(script) ? strings(script.matches) : [])))];
}

function localiser(folder: string, locale: string | null): (text: string) => string {
  const file = locale ? path.join(folder, '_locales', locale, 'messages.json') : null;
  let messages: Record<string, unknown> = {};
  if (file && existsSync(file)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
      messages = isRecord(parsed) ? parsed : {};
    } catch {
      messages = {};
    }
  }
  // Keys are matched without case, as Chrome matches them.
  const lowered = new Map(Object.entries(messages).map(([key, value]) => [key.toLowerCase(), value]));
  return (text) =>
    text.replace(/__MSG_(\w+?)__/g, (whole, key: string) => {
      const entry = lowered.get(key.toLowerCase());
      return isRecord(entry) && typeof entry.message === 'string' ? entry.message : whole;
    });
}

/** An image from inside the extension as a data URL, for the toolbar and Settings to draw without fetching anything. */
export function iconDataUrl(folder: string, relative: string | null): string | null {
  if (!relative) {
    return null;
  }
  const root = path.resolve(folder);
  const file = path.resolve(root, relative.replace(/^\//, ''));
  if (!file.startsWith(root + path.sep) || !existsSync(file)) {
    return null;
  }
  const type = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[
    path.extname(file).toLowerCase()
  ];
  if (!type) {
    return null;
  }
  try {
    return `data:${type};base64,${readFileSync(file).toString('base64')}`;
  } catch {
    return null;
  }
}
