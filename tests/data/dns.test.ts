import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESOLVER_ID,
  DNS_RESOLVERS,
  describeDns,
  dnsSwitchesFor,
  resolverFor,
} from '../../electron/shared/dns';
import { applyDnsSwitches, readDnsPreference } from '../../electron/main/app/command-line';

describe('the resolvers on offer', () => {
  it('all have a real https template', () => {
    for (const resolver of DNS_RESOLVERS) {
      expect(resolver.template.startsWith('https://')).toBe(true);
    }
  });

  // None of these can be verified from here, so the interface names who they
  // are rather than calling any of them private.
  it('says who each one is rather than calling it private', () => {
    for (const resolver of DNS_RESOLVERS) {
      expect(resolver.detail.length).toBeGreaterThan(40);
      expect(resolver.detail.toLowerCase()).not.toContain('completely private');
    }
  });

  it('has a default that exists', () => {
    expect(resolverFor(DEFAULT_RESOLVER_ID)).not.toBeNull();
  });
});

describe('what gets handed to Chromium', () => {
  it('sets nothing at all while the system resolver is in use', () => {
    expect(dnsSwitchesFor('system', 'quad9')).toBeNull();
  });

  /**
   * `secure` rather than `automatic` on purpose. Automatic falls back to
   * plaintext DNS when the resolver cannot be reached — the setting would stop
   * doing anything exactly when the network is interesting.
   */
  it('asks for secure mode, which fails rather than falling back', () => {
    expect(dnsSwitchesFor('encrypted', 'quad9')).toEqual({
      mode: 'secure',
      templates: 'https://dns.quad9.net/dns-query',
    });
  });

  it('sets nothing for a resolver it does not know', () => {
    expect(dnsSwitchesFor('encrypted', 'someone-elses-resolver')).toBeNull();
  });

  it('appends both switches, or neither', () => {
    const applied: string[] = [];
    const commandLine = { appendSwitch: (name: string) => applied.push(name) };
    applyDnsSwitches(commandLine, dnsSwitchesFor('encrypted', 'quad9'));
    expect(applied).toEqual(['dns-over-https-mode', 'dns-over-https-templates']);

    applied.length = 0;
    applyDnsSwitches(commandLine, null);
    expect(applied).toEqual([]);
  });
});

/**
 * Read off disk before the app is ready, because Chromium reads its command
 * line once and the store does not exist yet. Anything unreadable has to mean
 * the system resolver rather than a guess.
 */
describe('reading the preference before anything is running', () => {
  const read = (contents: string) => () => contents;

  it('finds an encrypted preference', () => {
    expect(readDnsPreference('x', read('{"dnsMode":"encrypted","dnsResolverId":"mullvad"}'))).toEqual({
      mode: 'secure',
      templates: 'https://dns.mullvad.net/dns-query',
    });
  });

  it.each([
    [
      'the file is missing',
      () => {
        throw new Error('ENOENT');
      },
    ],
    ['the file is corrupt', read('{not json')],
    ['the file is empty', read('')],
    ['it is not an object', read('"a string"')],
    ['no preference is set', read('{}')],
    ['the system resolver is chosen', read('{"dnsMode":"system"}')],
    ['the resolver is unknown', read('{"dnsMode":"encrypted","dnsResolverId":"nope"}')],
  ])('falls back to the system resolver when %s', (_name, reader) => {
    expect(readDnsPreference('x', reader as () => string)).toBeNull();
  });
});

describe('what the user is told', () => {
  it('says the network can read every name by default', () => {
    expect(describeDns('system', 'quad9')).toContain('can read every one of them');
  });

  // The whole point: turning it on moves the trust rather than removing it.
  it('names who can read them instead', () => {
    const detail = describeDns('encrypted', 'cloudflare');
    expect(detail).toContain('Cloudflare can');
    expect(detail).toContain('Your network can no longer read them');
  });

  it('warns that pages fail rather than falling back', () => {
    expect(describeDns('encrypted', 'quad9')).toContain('rather than quietly falling back');
  });
});
