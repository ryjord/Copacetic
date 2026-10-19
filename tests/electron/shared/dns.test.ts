import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESOLVER_ID,
  DNS_RESOLVERS,
  describeDns,
  hostResolverFor,
  resolverFor,
} from '../../../electron/shared/dns';

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
      expect(resolver.detail.length).toBeGreaterThan(20);
      expect(resolver.detail.toLowerCase()).not.toContain('completely private');
    }
  });

  it('has a default that exists', () => {
    expect(resolverFor(DEFAULT_RESOLVER_ID)).not.toBeNull();
  });
});

describe('what gets handed to Chromium', () => {
  it('leaves Chromium on its own default while the system resolver is in use', () => {
    expect(hostResolverFor('system', 'quad9')).toEqual({ secureDnsMode: 'automatic', secureDnsServers: [] });
  });

  /**
   * `secure` rather than `automatic` on purpose. Automatic falls back to
   * plaintext DNS when the resolver cannot be reached - the setting would stop
   * doing anything exactly when the network is interesting.
   */
  it('asks for secure mode, which fails rather than falling back', () => {
    expect(hostResolverFor('encrypted', 'quad9')).toEqual({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://dns.quad9.net/dns-query'],
    });
  });

  it('falls back to the default for a resolver it does not know', () => {
    expect(hostResolverFor('encrypted', 'someone-elses-resolver').secureDnsMode).toBe('automatic');
  });
});

describe('what the user is told', () => {
  it('says the network can read every name by default', () => {
    expect(describeDns('system', 'quad9')).toContain('can read every one');
  });

  // The whole point: turning it on moves the trust rather than removing it.
  it('names who can read them instead', () => {
    const detail = describeDns('encrypted', 'cloudflare');
    expect(detail).toContain('Cloudflare can');
    expect(detail).toContain('Your network cannot read them');
  });

  it('warns that pages fail rather than falling back', () => {
    expect(describeDns('encrypted', 'quad9')).toContain('pages will not load');
  });
});
