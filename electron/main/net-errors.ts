/**
 * Chromium network error codes, translated into something a person can act on.
 *
 * The error page shows the symbolic name too. Hiding it would be friendlier
 * right up until someone needs to search for it.
 */
interface NetErrorInfo {
  name: string;
  headline: string;
  description: string;
}

const NET_ERRORS: Record<number, NetErrorInfo> = {
  [-2]: {
    name: 'ERR_FAILED',
    headline: 'The request failed',
    description: 'Chromium stopped the request without saying why. Reloading often works.',
  },
  [-6]: {
    name: 'ERR_FILE_NOT_FOUND',
    headline: 'That file is not there',
    description: 'Nothing exists at this path on disk.',
  },
  [-7]: {
    name: 'ERR_TIMED_OUT',
    headline: 'The site took too long',
    description: 'The server accepted the connection but never finished replying.',
  },
  [-21]: {
    name: 'ERR_NETWORK_CHANGED',
    headline: 'Your network changed',
    description: 'You switched network partway through loading. Reload to start again.',
  },
  [-100]: {
    name: 'ERR_CONNECTION_CLOSED',
    headline: 'The connection closed early',
    description: 'The server hung up before sending a full response.',
  },
  [-101]: {
    name: 'ERR_CONNECTION_RESET',
    headline: 'The connection was reset',
    description: 'Something between you and the server dropped the connection.',
  },
  [-102]: {
    name: 'ERR_CONNECTION_REFUSED',
    headline: 'The server refused the connection',
    description: 'Nothing is listening on that address and port.',
  },
  [-105]: {
    name: 'ERR_NAME_NOT_RESOLVED',
    headline: 'That address does not exist',
    description: 'DNS has no record for this hostname. Check the spelling.',
  },
  [-106]: {
    name: 'ERR_INTERNET_DISCONNECTED',
    headline: 'You are offline',
    description: 'This machine has no network connection right now.',
  },
  [-107]: {
    name: 'ERR_SSL_PROTOCOL_ERROR',
    headline: 'The secure connection failed',
    description: 'The server sent a TLS response Chromium could not understand.',
  },
  [-109]: {
    name: 'ERR_ADDRESS_UNREACHABLE',
    headline: 'That address is unreachable',
    description: 'The route to this server does not go anywhere from your network.',
  },
  [-118]: {
    name: 'ERR_CONNECTION_TIMED_OUT',
    headline: 'The connection timed out',
    description: 'The server never answered. It may be down or blocked from here.',
  },
  [-130]: {
    name: 'ERR_PROXY_CONNECTION_FAILED',
    headline: 'The proxy did not respond',
    description: 'Your system proxy is configured but not reachable.',
  },
  [-137]: {
    name: 'ERR_NAME_RESOLUTION_FAILED',
    headline: 'DNS lookup failed',
    description: 'Your DNS resolver could not be reached.',
  },
  [-200]: {
    name: 'ERR_CERT_COMMON_NAME_INVALID',
    headline: 'This certificate is for a different site',
    description: 'The certificate does not cover this hostname. Do not enter anything sensitive.',
  },
  [-201]: {
    name: 'ERR_CERT_DATE_INVALID',
    headline: 'This certificate is out of date',
    description: 'It has expired or is not valid yet. Check your system clock first.',
  },
  [-202]: {
    name: 'ERR_CERT_AUTHORITY_INVALID',
    headline: 'This certificate is not trusted',
    description: 'It was not issued by an authority your system trusts.',
  },
  [-206]: {
    name: 'ERR_CERT_REVOKED',
    headline: 'This certificate was revoked',
    description: 'Its issuer withdrew it. Treat this site as compromised.',
  },
  [-207]: {
    name: 'ERR_CERT_INVALID',
    headline: 'This certificate is invalid',
    description: 'Chromium could not make sense of the certificate the server sent.',
  },
  [-300]: {
    name: 'ERR_INVALID_URL',
    headline: 'That address is not valid',
    description: 'Copacetic could not parse it as a web address.',
  },
  [-301]: {
    name: 'ERR_DISALLOWED_URL_SCHEME',
    headline: 'That kind of address is blocked',
    description: 'Copacetic only opens http, https and file addresses in a tab.',
  },
  [-302]: {
    name: 'ERR_UNKNOWN_URL_SCHEME',
    headline: 'Nothing handles that address',
    description: 'No application on this machine is registered for this scheme.',
  },
  [-310]: {
    name: 'ERR_TOO_MANY_REDIRECTS',
    headline: 'The site redirected too many times',
    description: 'It sent you in a loop. Clearing cookies for the site often fixes it.',
  },
  [-324]: {
    name: 'ERR_EMPTY_RESPONSE',
    headline: 'The server sent nothing back',
    description: 'The connection succeeded but the response was empty.',
  },
  [-501]: {
    name: 'ERR_INSECURE_RESPONSE',
    headline: 'The response was not secure',
    description: 'Part of this page was served over a connection that failed validation.',
  },
};

export function describeNetError(code: number, fallbackDescription: string): NetErrorInfo {
  const known = NET_ERRORS[code];
  if (known) return known;
  return {
    name: `ERR_${Math.abs(code)}`,
    headline: 'This page did not load',
    description: fallbackDescription || 'Chromium reported an error without a description.',
  };
}

/** Errors that mean "the user navigated away", not "something broke". */
export function isAbortError(code: number): boolean {
  return code === -3 || code === 0;
}
