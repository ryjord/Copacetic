import type { Certificate, Session } from 'electron';
import type { CertificateSummary } from '../shared/types';

// The only value this may ever return: 0 means accept, which would treat every expired,
// self-signed and wrong-hostname certificate as valid. Observing must never become deciding.
const USE_CHROMIUM_VERDICT = -3;

// Certificates seen this session, so the badge can describe the current page.
const seen = new Map<string, CertificateSummary>();

/** Bounded: a long session touching many hosts should not grow without limit. */
const MAX_REMEMBERED = 300;

/** Watch certificate verification without influencing it. */
export function observeCertificates(session: Session): void {
  session.setCertificateVerifyProc((request, callback) => {
    try {
      remember(request.hostname, request.certificate, request.verificationResult, request.isIssuedByKnownRoot);
    } catch {
      // Recording is a nicety; it must never affect whether a page loads.
    }
    callback(USE_CHROMIUM_VERDICT);
  });
}

function remember(
  hostname: string,
  certificate: Certificate | undefined,
  verificationResult: string,
  isIssuedByKnownRoot: boolean,
): void {
  if (!hostname || !certificate) return;
  // Only describe a certificate Chromium actually accepted. Reporting the
  // issuer of a rejected certificate would dress up a failed connection as an
  // informative one.
  if (verificationResult !== 'net::OK') return;

  const key = hostname.toLowerCase();
  // Delete before setting so a refreshed entry moves to the back of the
  // iteration order. Without it eviction is oldest-first-seen, which can drop
  // the certificate of the page the user is currently looking at.
  seen.delete(key);
  if (seen.size >= MAX_REMEMBERED) {
    const oldest = seen.keys().next();
    if (!oldest.done) seen.delete(oldest.value);
  }
  seen.set(key, summariseCertificate(certificate, isIssuedByKnownRoot));
}

export function certificateFor(hostname: string): CertificateSummary | null {
  return seen.get(hostname.toLowerCase()) ?? null;
}

export function forgetCertificates(): void {
  seen.clear();
}

/** Electron reports validity in seconds since the epoch; everything else in this codebase works in milliseconds. */
export function summariseCertificate(certificate: Certificate, isIssuedByKnownRoot = true): CertificateSummary {
  return {
    issuer: certificate.issuerName || certificate.issuer?.commonName || 'Unknown',
    subject: certificate.subjectName || certificate.subject?.commonName || '',
    validFrom: (certificate.validStart ?? 0) * 1000,
    validTo: (certificate.validExpiry ?? 0) * 1000,
    fingerprint: certificate.fingerprint ?? '',
    isIssuedByKnownRoot,
  };
}
