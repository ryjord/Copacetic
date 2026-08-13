import { START_PAGE_URL, hostOf, isLoopbackHost } from '../shared/url';
import type { CertificateSummary, SecurityState } from '../shared/types';

export function describeSecurity(
  url: string,
  certificate: CertificateSummary | null = null,
  certificateChange = '',
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
