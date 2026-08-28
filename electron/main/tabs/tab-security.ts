import { START_PAGE_URL, hostOf, isLoopbackHost } from '../../shared/url';
import type { CertificateSummary, SecurityState } from '../../shared/types';

export function describeSecurity(
  url: string,
  certificate: CertificateSummary | null = null,
  certificateChange = '',
  /** Set when this page loaded on a certificate Copacetic accepted because it came from this machine. */
  trustedLocally = false,
  /** Set when the page did not load. */
  failed = false,
): SecurityState {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  if (!parsed || url === START_PAGE_URL) {
    return {
      level: 'internal',
      scheme: 'copacetic',
      host: 'start',
      detail: 'A Copacetic page. Nothing here touches the network.',
      certificate: null,
      certificateChange: '',
    };
  }

  const scheme = parsed.protocol.replace(/:$/, '');
  const host = parsed.hostname;

  // Nothing was exchanged, so there is no connection to describe. Calling it
  // encrypted and checked would dress a failure up as an informative page.
  if (failed) {
    return {
      level: 'unknown',
      scheme,
      host,
      detail: 'This page did not load, so there is nothing to say about the connection.',
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'copacetic' || scheme === 'about') {
    return {
      level: 'internal',
      scheme,
      host,
      detail: 'A Copacetic page. Nothing here touches the network.',
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'file') {
    return {
      level: 'internal',
      scheme,
      host: hostOf(url) || 'local file',
      detail: 'A file on this machine. It was never sent over a network.',
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'https' && trustedLocally) {
    return {
      level: 'secure',
      scheme,
      host,
      // Not the usual claim, because the usual check did not happen.
      detail:
        'Encrypted to a server on this machine. Its certificate was not checked against any authority — Copacetic accepts those from loopback so local development works, and this traffic never leaves your machine.',
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'https') {
    return {
      level: 'secure',
      scheme,
      host,
      detail: 'Encrypted. Chromium checked this site’s certificate against your system’s trusted authorities.',
      certificate,
      certificateChange,
    };
  }

  if (scheme === 'http' && isLoopbackHost(host)) {
    return {
      level: 'secure',
      scheme,
      host,
      detail: 'Loopback connection. This traffic never leaves your machine.',
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'http') {
    return {
      level: 'insecure',
      scheme,
      host,
      detail: 'Not encrypted. Anyone on this network can read this page and change it before you see it.',
      certificate: null,
      certificateChange: '',
    };
  }

  return {
    level: 'unknown',
    scheme,
    host,
    detail: 'Copacetic cannot describe this connection.',
    certificate: null,
    certificateChange: '',
  };
}
