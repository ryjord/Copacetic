import { sameSite } from '../../shared/forgetting';
import type { RememberedCertificate } from '../../shared/certificate-changes';
import { PersistedFile, isRecord } from './persistence';

/**
 * What each site presented last time. Nothing here is secret — it is what the
 * site handed out publicly — but without it a chain that starts ending at a
 * locally-installed root cannot be noticed at all.
 */
export class CertificatesStore {
  private readonly file = new PersistedFile<Record<string, RememberedCertificate>>(
    'certificates.json',
    () => ({}),
    reviveCertificates,
  );

  for(origin: string): RememberedCertificate | null {
    return this.file.get()[origin] ?? null;
  }

  remember(origin: string, next: RememberedCertificate): void {
    this.file.update((current) => ({ ...current, [origin]: next }));
  }

  /** Every origin a certificate is remembered for. */
  origins(): string[] {
    return Object.keys(this.file.get());
  }

  /** Forgets what was accepted for one site, subdomains included. */
  forgetSite(site: string): number {
    let removed = 0;
    this.file.update((current) => {
      const kept: Record<string, RememberedCertificate> = {};
      for (const [origin, record] of Object.entries(current)) {
        if (sameSite(origin, site)) {
          removed += 1;
        } else {
          kept[origin] = record;
        }
      }
      return kept;
    });
    return removed;
  }

  forgetAll(): void {
    this.file.set({});
  }

  flush(): void {
    this.file.flush();
  }
}

/**
 * Reads the file one entry at a time, keeping what is a certificate and
 * dropping what is not.
 *
 * It was cast rather than read: `raw as Record<string, RememberedCertificate>`
 * asserts a shape without looking at it, so a single malformed entry — a hand
 * edit, a truncated write from an older version, anything at all — reached the
 * comparison as a string or a number. Comparing a fingerprint that is not there
 * makes every certificate look changed, or makes none of them look changed, and
 * this is the feature that exists to notice interception.
 *
 * A bad entry loses its own site's record, which means the next visit is
 * treated as a first visit. Refusing the whole file instead would turn one bad
 * line into a browser that has forgotten every certificate it ever saw.
 */
function reviveCertificates(raw: unknown): Record<string, RememberedCertificate> | null {
  if (!isRecord(raw)) {
    return null;
  }

  const kept: Record<string, RememberedCertificate> = {};
  for (const [origin, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      continue;
    }
    const { fingerprint, issuer, isIssuedByKnownRoot, firstSeenAt } = value;
    if (
      typeof fingerprint !== 'string' ||
      fingerprint === '' ||
      typeof issuer !== 'string' ||
      typeof isIssuedByKnownRoot !== 'boolean' ||
      typeof firstSeenAt !== 'number' ||
      !Number.isFinite(firstSeenAt)
    ) {
      continue;
    }
    kept[origin] = { fingerprint, issuer, isIssuedByKnownRoot, firstSeenAt };
  }
  return kept;
}
