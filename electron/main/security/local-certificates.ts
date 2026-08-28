import { app } from 'electron';
import { hostOf, isLoopbackHost, originOf } from '../../shared/url';
import { log } from '../system/diagnostics';

/**
 * A development server on this machine almost always has a certificate no
 * authority signed, and refusing it means Copacetic cannot open the work of the
 * person using it. Chromium makes the same exception for the same reason.
 *
 * It is worth nothing to an attacker: reaching loopback traffic means already
 * being on the machine, at which point a certificate is not what is protecting
 * anybody. Every other host keeps Chromium's verdict exactly as it was.
 */

/** Hosts an exception was granted for this session, so the badge can stop claiming the certificate was checked. */
const granted = new Set<string>();

/** Only a server on this machine, reached over https. Anything else is refused. */
export function mayTrustLocally(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && isLoopbackHost(parsed.hostname);
}

/** Keyed by origin: one bad certificate on :8443 says nothing about :3000. */
export function trustedLocally(origin: string): boolean {
  return granted.has(origin.toLowerCase());
}

/** Cleared with the rest of a session's browsing. */
export function forgetLocalCertificates(): void {
  granted.clear();
}

export function allowLocalCertificates(): void {
  app.on('certificate-error', (event, _contents, url, error, _certificate, callback) => {
    if (!mayTrustLocally(url)) {
      // Chromium already refused it, and it stays refused.
      callback(false);
      return;
    }

    event.preventDefault();
    const origin = originOf(url);
    if (origin && !granted.has(origin)) {
      granted.add(origin);
      log.info('trusted a certificate from this machine', { host: hostOf(url), reason: error });
    }
    callback(true);
  });
}
