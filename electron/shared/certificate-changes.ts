// Certificates rotate constantly and legitimately. Reporting every change would
// train people to ignore the one that matters.

export interface RememberedCertificate {
  fingerprint: string;
  issuer: string;
  isIssuedByKnownRoot: boolean;
  firstSeenAt: number;
}

export type CertificateChange =
  /** Nothing worth saying: first visit, or the same certificate, or an ordinary renewal. */
  | 'none'
  /** A different authority signed it. Usually a migration; occasionally not. */
  | 'issuer-changed'
  /** The chain now ends at a root installed on this machine. This is what interception looks like. */
  | 'now-locally-trusted';

export interface CertificateComparison {
  change: CertificateChange;
  /** What to say, in the words shown to the user. Empty when there is nothing to say. */
  detail: string;
}

const NOTHING: CertificateComparison = { change: 'none', detail: '' };

/**
 * The one that matters is a chain that used to end at a root shipped with the
 * system and now ends at one installed here. That is what a corporate proxy,
 * an antivirus that opens TLS, or an attacker with local access all look like
 * from inside the browser — and it is the only case worth interrupting for.
 */
export function compareCertificate(
  remembered: RememberedCertificate | null,
  current: { fingerprint: string; issuer: string; isIssuedByKnownRoot: boolean },
): CertificateComparison {
  if (!remembered || remembered.fingerprint === current.fingerprint) {
    return NOTHING;
  }

  if (remembered.isIssuedByKnownRoot && !current.isIssuedByKnownRoot) {
    return {
      change: 'now-locally-trusted',
      detail:
        'This site’s certificate now comes from an authority installed on this machine rather than one shipped with your system. Software on this computer, or the network you are on, is reading this connection. That is how a workplace proxy and an antivirus that inspects traffic both work — and it is also what an attacker would look like.',
    };
  }

  if (remembered.issuer !== current.issuer) {
    return {
      change: 'issuer-changed',
      detail: `This site’s certificate is now issued by ${current.issuer} rather than ${remembered.issuer}. Sites change authority for ordinary reasons, so this is worth a glance rather than an alarm.`,
    };
  }

  // Same authority, new certificate: a renewal, which happens every few months.
  return NOTHING;
}

/** What to remember after a visit, given what was already known. */
export function rememberCertificate(
  remembered: RememberedCertificate | null,
  current: { fingerprint: string; issuer: string; isIssuedByKnownRoot: boolean },
  now: number,
): RememberedCertificate {
  return {
    fingerprint: current.fingerprint,
    issuer: current.issuer,
    isIssuedByKnownRoot: current.isIssuedByKnownRoot,
    // Carried across a renewal, so "first seen" means the site rather than this
    // particular certificate — otherwise it resets every few months and stops
    // meaning anything.
    firstSeenAt: remembered?.firstSeenAt ?? now,
  };
}
