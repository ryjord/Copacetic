import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESOLVER_ID,
  DNS_RESOLVERS,
  describeDns,
  hostResolverFor,
  resolverFor,
} from '../../../../electron/shared/browsing/dns';

describe('the resolvers on offer', () => {
  it('all have a real https template, and the default is one of them', () => {
    for (const resolver of DNS_RESOLVERS) {
      expect(resolver.template.startsWith('https://')).toBe(true);
    }
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
  // The whole point: turning it on moves the trust rather than removing it.
  it('names who can read them instead', () => {
    const detail = describeDns('encrypted', 'cloudflare');
    expect(detail).toContain('Cloudflare can');
    expect(detail).toContain('Your network cannot read them');
  });
});
