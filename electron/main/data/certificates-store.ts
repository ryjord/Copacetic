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

  forgetAll(): void {
    this.file.set({});
  }

  flush(): void {
    this.file.flush();
  }
}
