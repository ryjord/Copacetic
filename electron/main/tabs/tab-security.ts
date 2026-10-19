import { START_PAGE_URL, hostOf, isLoopbackHost } from '../../shared/browsing/url';
import type { CertificateSummary, SecurityState } from '../../shared/types';
import { t } from '../../shared/i18n/translate';

export function describeSecurity(
  url: string,
  certificate: CertificateSummary | null = null,
  certificateChange = '',
  /** How this page's certificate was accepted when Chromium refused it: from this machine, or by the person. */
  exception: 'local' | 'accepted' | null = null,
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
      detail: t('main.security.internalPage'),
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
      detail: t('main.security.failed'),
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'copacetic' || scheme === 'about') {
    return {
      level: 'internal',
      scheme,
      host,
      detail: t('main.security.internalPage'),
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'file') {
    return {
      level: 'internal',
      scheme,
      host: hostOf(url) || t('main.security.localFile.host'),
      detail: t('main.security.localFile.detail'),
      certificate: null,
      certificateChange: '',
    };
  }

  // Encrypted, but to whom is exactly the question that went unanswered.
  if (scheme === 'https' && exception === 'accepted') {
    return {
      level: 'insecure',
      scheme,
      host,
      detail: t('main.security.acceptedException'),
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'https' && exception === 'local') {
    return {
      level: 'secure',
      scheme,
      host,
      // Not the usual claim, because the usual check did not happen.
      detail: t('main.security.localException'),
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'https') {
    return {
      level: 'secure',
      scheme,
      host,
      detail: t('main.security.secure'),
      certificate,
      certificateChange,
    };
  }

  if (scheme === 'http' && isLoopbackHost(host)) {
    return {
      level: 'secure',
      scheme,
      host,
      detail: t('main.security.loopback'),
      certificate: null,
      certificateChange: '',
    };
  }

  if (scheme === 'http') {
    return {
      level: 'insecure',
      scheme,
      host,
      detail: t('main.security.insecure'),
      certificate: null,
      certificateChange: '',
    };
  }

  return {
    level: 'unknown',
    scheme,
    host,
    detail: t('main.security.unknown'),
    certificate: null,
    certificateChange: '',
  };
}
