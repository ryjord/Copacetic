import { type Session, app } from 'electron';
import { isLoopbackHost, originOf } from '../../shared/browsing/url';
import { log } from '../system/diagnostics';

/**
 * When a certificate Chromium refused is accepted anyway, and nowhere else.
 *
 * Two cases, and only two. A development server on this machine almost always
 * has a certificate no authority signed; refusing it means Copacetic cannot
 * open the work of the person using it, and it is worth nothing to an attacker,
 * who would already have to be on the machine. Chromium makes the same
 * exception for the same reason.
 *
 * Anywhere else, a person who has read why the certificate was refused can
 * choose to continue. That choice covers that origin and that exact
 * certificate, in that session only, lasts until Copacetic closes, and is
 * never written down. A different certificate on the same site is a new
 * question, and so is the same site in another profile or a Hush tab.
 */

/** Errors no one can be talked past: the authority itself withdrew the certificate. */
const NEVER_ACCEPTED = new Set(['net::ERR_CERT_REVOKED']);

/** Origins accepted because they are this machine, so the badge can stop claiming a check happened. */
const local = new Set<string>();
/** By session, origin to the fingerprint of the one certificate a person accepted there. */
const accepted = new Map<Session | undefined, Map<string, string>>();
/** The last certificate refused in each tab, so its error page can offer to continue. */
const refused = new Map<
  number,
  { origin: string; fingerprint: string; error: string; session: Session | undefined }
>();

function acceptedIn(session: Session | undefined): Map<string, string> {
  const existing = accepted.get(session);
  if (existing) {
    return existing;
  }
  const fresh = new Map<string, string>();
  accepted.set(session, fresh);
  return fresh;
}

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

/** How a page's certificate came to be accepted, when Chromium did not accept it. */
export function exceptionFor(origin: string, session: Session | undefined): 'local' | 'accepted' | null {
  const key = origin.toLowerCase();
  if (local.has(key)) {
    return 'local';
  }
  return accepted.get(session)?.has(key) ? 'accepted' : null;
}

/** Whether the refusal that stopped this tab's page can be continued past. */
export function canAcceptRefused(webContentsId: number, url: string): boolean {
  const last = refused.get(webContentsId);
  return last !== undefined && last.origin === originOf(url) && !NEVER_ACCEPTED.has(last.error);
}

/** The person chose to continue. Covers the refused certificate only. */
export function acceptRefused(webContentsId: number, url: string): boolean {
  if (!canAcceptRefused(webContentsId, url)) {
    return false;
  }
  const last = refused.get(webContentsId)!;
  acceptedIn(last.session).set(last.origin, last.fingerprint);
  refused.delete(webContentsId);
  // No host: the log promises never to name a site, and in a Hush tab it would be a record of one.
  log.info('a certificate was accepted after a warning', { reason: last.error });
  return true;
}

export function forgetTab(webContentsId: number): void {
  refused.delete(webContentsId);
}

/** Cleared with the rest of a session's browsing. */
export function forgetCertificateExceptions(): void {
  local.clear();
  accepted.clear();
  refused.clear();
}

export function watchCertificateErrors(): void {
  app.on('certificate-error', (event, contents, url, error, certificate, callback) => {
    const origin = originOf(url);

    if (mayTrustLocally(url)) {
      event.preventDefault();
      if (origin && !local.has(origin)) {
        local.add(origin);
        log.info('trusted a certificate from this machine', { reason: error });
      }
      callback(true);
      return;
    }

    const fingerprint = certificate?.fingerprint ?? '';
    if (origin && fingerprint && accepted.get(contents?.session)?.get(origin) === fingerprint) {
      event.preventDefault();
      callback(true);
      return;
    }

    // Chromium already refused it, and it stays refused until a person says otherwise.
    if (origin && fingerprint && contents) {
      refused.set(contents.id, { origin, fingerprint, error, session: contents.session });
    }
    callback(false);
  });
}
