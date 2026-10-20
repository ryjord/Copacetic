/**
 * Every name you visit is normally resolved in plaintext by whoever runs your
 * network. Encrypting that is one switch. The part nobody does is saying which
 * company now answers those questions instead - turning it on silently would be
 * the same move it is meant to protect you from.
 */

import { t } from '../i18n/translate';

export type DnsMode = 'system' | 'encrypted';

export interface DnsResolver {
  id: string;
  name: string;
  template: string;
  /** Who they are and what they say they keep, in plain words. */
  detail: string;
}

/**
 * Deliberately short. Each of these publishes a no-logging policy; none of them
 * can be verified from here, which is why the interface says who they are
 * rather than calling any of them private.
 */
export const DNS_RESOLVERS: readonly DnsResolver[] = [
  {
    id: 'quad9',
    name: 'Quad9',
    template: 'https://dns.quad9.net/dns-query',
    detail: t('main.dns.resolvers.quad9'),
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    template: 'https://cloudflare-dns.com/dns-query',
    detail: t('main.dns.resolvers.cloudflare'),
  },
  {
    id: 'mullvad',
    name: 'Mullvad',
    template: 'https://dns.mullvad.net/dns-query',
    detail: t('main.dns.resolvers.mullvad'),
  },
];

export const DEFAULT_RESOLVER_ID = 'quad9';

export function resolverFor(id: string): DnsResolver | null {
  return DNS_RESOLVERS.find((resolver) => resolver.id === id) ?? null;
}

/** What Electron's host resolver is told, in its own option names. */
export interface HostResolverOptions {
  secureDnsMode: 'automatic' | 'secure';
  secureDnsServers: string[];
}

/**
 * `secure` rather than `automatic` on purpose. Automatic falls back to
 * plaintext DNS when the resolver cannot be reached, which means the setting
 * quietly stops doing anything exactly when the network is interesting. This
 * fails instead, and Settings says so before you turn it on.
 *
 * The system choice is Chromium's own default, which upgrades to encrypted DNS
 * only where your network's own provider offers it.
 */
export function hostResolverFor(mode: DnsMode, resolverId: string): HostResolverOptions {
  const resolver = mode === 'encrypted' ? resolverFor(resolverId) : null;
  if (!resolver) {
    return { secureDnsMode: 'automatic', secureDnsServers: [] };
  }
  return { secureDnsMode: 'secure', secureDnsServers: [resolver.template] };
}

/** What is actually happening to your DNS, in the words shown to the user. */
export function describeDns(mode: DnsMode, resolverId: string): string {
  if (mode !== 'encrypted') {
    return t('main.dns.describe.system');
  }
  const resolver = resolverFor(resolverId);
  if (!resolver) {
    return t('main.dns.describe.noProvider');
  }
  return t('main.dns.describe.encrypted', { name: resolver.name });
}
