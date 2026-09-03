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
    (raw) => (isRecord(raw) ? (raw as Record<string, RememberedCertificate>) : null),
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
