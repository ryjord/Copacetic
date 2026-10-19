// Chromium network error codes, translated into something a person can act on.

import { t } from '../../shared/i18n/translate';

interface NetErrorInfo {
  name: string;
  headline: string;
  description: string;
}

const NET_ERRORS: Record<number, NetErrorInfo> = {
  [-2]: {
    name: 'ERR_FAILED',
    headline: t('main.netErrors.failed.headline'),
    description: t('main.netErrors.failed.description'),
  },
  [-6]: {
    name: 'ERR_FILE_NOT_FOUND',
    headline: t('main.netErrors.fileNotFound.headline'),
    description: t('main.netErrors.fileNotFound.description'),
  },
  [-7]: {
    name: 'ERR_TIMED_OUT',
    headline: t('main.netErrors.timedOut.headline'),
    description: t('main.netErrors.timedOut.description'),
  },
  [-21]: {
    name: 'ERR_NETWORK_CHANGED',
    headline: t('main.netErrors.networkChanged.headline'),
    description: t('main.netErrors.networkChanged.description'),
  },
  [-100]: {
    name: 'ERR_CONNECTION_CLOSED',
    headline: t('main.netErrors.connectionClosed.headline'),
    description: t('main.netErrors.connectionClosed.description'),
  },
  [-101]: {
    name: 'ERR_CONNECTION_RESET',
    headline: t('main.netErrors.connectionReset.headline'),
    description: t('main.netErrors.connectionReset.description'),
  },
  [-102]: {
    name: 'ERR_CONNECTION_REFUSED',
    headline: t('main.netErrors.connectionRefused.headline'),
    description: t('main.netErrors.connectionRefused.description'),
  },
  [-105]: {
    name: 'ERR_NAME_NOT_RESOLVED',
    headline: t('main.netErrors.nameNotResolved.headline'),
    description: t('main.netErrors.nameNotResolved.description'),
  },
  [-106]: {
    name: 'ERR_INTERNET_DISCONNECTED',
    headline: t('main.netErrors.internetDisconnected.headline'),
    description: t('main.netErrors.internetDisconnected.description'),
  },
  [-107]: {
    name: 'ERR_SSL_PROTOCOL_ERROR',
    headline: t('main.netErrors.sslProtocolError.headline'),
    description: t('main.netErrors.sslProtocolError.description'),
  },
  [-109]: {
    name: 'ERR_ADDRESS_UNREACHABLE',
    headline: t('main.netErrors.addressUnreachable.headline'),
    description: t('main.netErrors.addressUnreachable.description'),
  },
  [-118]: {
    name: 'ERR_CONNECTION_TIMED_OUT',
    headline: t('main.netErrors.connectionTimedOut.headline'),
    description: t('main.netErrors.connectionTimedOut.description'),
  },
  [-130]: {
    name: 'ERR_PROXY_CONNECTION_FAILED',
    headline: t('main.netErrors.proxyConnectionFailed.headline'),
    description: t('main.netErrors.proxyConnectionFailed.description'),
  },
  [-137]: {
    name: 'ERR_NAME_RESOLUTION_FAILED',
    headline: t('main.netErrors.nameResolutionFailed.headline'),
    description: t('main.netErrors.nameResolutionFailed.description'),
  },
  [-200]: {
    name: 'ERR_CERT_COMMON_NAME_INVALID',
    headline: t('main.netErrors.certCommonNameInvalid.headline'),
    description: t('main.netErrors.certCommonNameInvalid.description'),
  },
  [-201]: {
    name: 'ERR_CERT_DATE_INVALID',
    headline: t('main.netErrors.certDateInvalid.headline'),
    description: t('main.netErrors.certDateInvalid.description'),
  },
  [-202]: {
    name: 'ERR_CERT_AUTHORITY_INVALID',
    headline: t('main.netErrors.certAuthorityInvalid.headline'),
    description: t('main.netErrors.certAuthorityInvalid.description'),
  },
  [-206]: {
    name: 'ERR_CERT_REVOKED',
    headline: t('main.netErrors.certRevoked.headline'),
    description: t('main.netErrors.certRevoked.description'),
  },
  [-207]: {
    name: 'ERR_CERT_INVALID',
    headline: t('main.netErrors.certInvalid.headline'),
    description: t('main.netErrors.certInvalid.description'),
  },
  [-300]: {
    name: 'ERR_INVALID_URL',
    headline: t('main.netErrors.invalidUrl.headline'),
    description: t('main.netErrors.invalidUrl.description'),
  },
  [-301]: {
    name: 'ERR_DISALLOWED_URL_SCHEME',
    headline: t('main.netErrors.disallowedUrlScheme.headline'),
    description: t('main.netErrors.disallowedUrlScheme.description'),
  },
  [-302]: {
    name: 'ERR_UNKNOWN_URL_SCHEME',
    headline: t('main.netErrors.unknownUrlScheme.headline'),
    description: t('main.netErrors.unknownUrlScheme.description'),
  },
  [-310]: {
    name: 'ERR_TOO_MANY_REDIRECTS',
    headline: t('main.netErrors.tooManyRedirects.headline'),
    description: t('main.netErrors.tooManyRedirects.description'),
  },
  [-324]: {
    name: 'ERR_EMPTY_RESPONSE',
    headline: t('main.netErrors.emptyResponse.headline'),
    description: t('main.netErrors.emptyResponse.description'),
  },
  [-501]: {
    name: 'ERR_INSECURE_RESPONSE',
    headline: t('main.netErrors.insecureResponse.headline'),
    description: t('main.netErrors.insecureResponse.description'),
  },
};

export function describeNetError(code: number, fallbackDescription: string): NetErrorInfo {
  const known = NET_ERRORS[code];
  if (known) {
    return known;
  }
  return {
    name: `ERR_${Math.abs(code)}`,
    headline: t('main.netErrors.generic.headline'),
    description: fallbackDescription || t('main.netErrors.generic.description'),
  };
}

/** Errors that mean "the user navigated away", not "something broke". */
export function isAbortError(code: number): boolean {
  return code === -3 || code === 0;
}
