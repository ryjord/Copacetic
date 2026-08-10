import type { Certificate, Session } from 'electron';
import type { CertificateSummary } from '../shared/types';

/**
 * Chromium's own verdict, unchanged.
 *
 * This is the only value this file may ever pass to the verify callback.
 * `0` means "accept", and answering that would replace Chromium's certificate
 * validation with a blanket yes — every expired, self-signed and
 * wrong-hostname certificate on the internet would be treated as valid, in a
 * browser whose entire pitch is telling you the truth about the connection.
 *
 * The purpose here is to *observe* what Chromium decided so the interface can
 * describe it. Observing must never become deciding.
 */
const USE_CHROMIUM_VERDICT = -3;

/** Certificates seen this session, so the badge can describe the current page. */
const seen = new Map<string, CertificateSummary>();

/** Bounded: a long session touching many hosts should not grow without limit. */
const MAX_REMEMBERED = 300;

/**
 * Watch certificate verification without influencing it.
 *
 * Electron offers no way to ask "what certificate is this page using?" after
 * the fact, so the only place to see one is as it is verified.
 */
export function observeCertificates(session: Session): void {
  session.setCertificateVerifyProc((request, callback) => {
    try {
      remember(request.hostname, request.certificate, request.verificationResult);
    } catch {
      // Recording is a nicety; it must never affect whether a page loads.
    }
    callback(USE_CHROMIUM_VERDICT);
  });
}

function remember(hostname: string, certificate: Certificate | undefined, verificationResult: string): void {
  if (!hostname || !certificate) return;
  // Only describe a certificate Chromium actually accepted. Reporting the
  // issuer of a rejected certificate would dress up a failed connection as an
  // informative one.
  if (verificationResult !== 'net::OK') return;

  if (seen.size >= MAX_REMEMBERED) {
    const oldest = seen.keys().next();
    if (!oldest.done) seen.delete(oldest.value);
  }
  seen.set(hostname.toLowerCase(), summariseCertificate(certificate));
}

export function certificateFor(hostname: string): CertificateSummary | null {
  return seen.get(hostname.toLowerCase()) ?? null;
}

export function forgetCertificates(): void {
  seen.clear();
}

/**
 * Electron reports validity in seconds since the epoch; everything else in
 * this codebase works in milliseconds.
 */
export function summariseCertificate(certificate: Certificate): CertificateSummary {
  return {
    issuer: certificate.issuerName || certificate.issuer?.commonName || 'Unknown',
    subject: certificate.subjectName || certificate.subject?.commonName || '',
    validFrom: (certificate.validStart ?? 0) * 1000,
    validTo: (certificate.validExpiry ?? 0) * 1000,
    fingerprint: certificate.fingerprint ?? '',
  };
}
