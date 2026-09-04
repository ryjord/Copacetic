import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_CERTS_DIR } }));

const { CertificatesStore } = await import('../../electron/main/data/certificates-store');

let dir: string;
const write = (contents: unknown) =>
  writeFileSync(path.join(dir, 'certificates.json'), JSON.stringify(contents), 'utf8');

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-certs-'));
  process.env.COPA_CERTS_DIR = dir;
});

const good = {
  fingerprint: 'sha256/AAAA',
  issuer: 'Example CA',
  isIssuedByKnownRoot: true,
  firstSeenAt: 1_700_000_000_000,
};

/**
 * This is the file that lets the browser notice a chain which has started
 * ending at a root installed on the machine — which is what interception looks
 * like. It was cast rather than read: the whole record was asserted to have the
 * right shape without anything checking, so one malformed entry reached the
 * comparison as a string or a number.
 */
describe('reading certificates back', () => {
  it('keeps an entry that is a certificate', () => {
    write({ 'https://example.com': good });
    expect(new CertificatesStore().for('https://example.com')).toEqual(good);
  });

  it.each([
    ['a string where an object should be', 'not-a-certificate'],
    ['a number', 42],
    ['null', null],
    ['no fingerprint', { ...good, fingerprint: undefined }],
    ['an empty fingerprint', { ...good, fingerprint: '' }],
    ['a fingerprint that is not text', { ...good, fingerprint: 12345 }],
    ['a known-root flag that is not a boolean', { ...good, isIssuedByKnownRoot: 'yes' }],
    ['a first-seen time that is not a number', { ...good, firstSeenAt: 'yesterday' }],
    ['an infinite first-seen time', { ...good, firstSeenAt: Number.POSITIVE_INFINITY }],
  ])('drops %s', (_case, value) => {
    write({ 'https://example.com': value });
    expect(new CertificatesStore().for('https://example.com')).toBeNull();
  });

  /*
   * The important half. Refusing the whole file over one bad line would turn a
   * single damaged entry into a browser that has forgotten every certificate it
   * ever saw — which is the same feature failing, more quietly and for every
   * site at once.
   */
  it('loses only the entry that is wrong, not the ones beside it', () => {
    write({
      // Both shapes of wrong: not an object at all, and an object whose fields
      // are not what they claim. They leave by different routes and each has to
      // take only itself with it.
      'https://broken.example': 'not-a-certificate',
      'https://half-broken.example': { ...good, firstSeenAt: 'yesterday' },
      'https://fine.example': good,
      'https://also-fine.example': { ...good, fingerprint: 'sha256/BBBB' },
    });

    const store = new CertificatesStore();
    expect(store.for('https://broken.example')).toBeNull();
    expect(store.for('https://half-broken.example')).toBeNull();
    expect(store.for('https://fine.example')).toEqual(good);
    expect(store.for('https://also-fine.example')?.fingerprint).toBe('sha256/BBBB');
    expect(store.origins().sort()).toEqual(['https://also-fine.example', 'https://fine.example']);
  });

  // A file that is not a record at all is not a partial loss, and falls back to
  // knowing nothing rather than to something half-read.
  it('starts empty when the file is not a record', () => {
    write(['not', 'a', 'record']);
    expect(new CertificatesStore().origins()).toEqual([]);
  });
});
