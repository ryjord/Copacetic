// Libs
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';

// Utils
import { t } from '../../shared/i18n/translate';

/** What the release's manifest says the file is. */
export interface ExpectedFile {
  sha512: string;
  size: number;
}

/**
 * Saves a download to the target only once it is the file that was published.
 *
 * Written beside the target and renamed at the end, so a file already there is never truncated or torn, and stopped
 * as soon as it runs past its stated size.
 */
export async function writeVerified(
  body: ReadableStream<Uint8Array>,
  target: string,
  expected: ExpectedFile,
  onPercent: (percent: number) => void,
): Promise<void> {
  const hash = createHash('sha512');
  const partial = `${target}.part`;
  const file = createWriteStream(partial);
  const reader = body.getReader();
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      hash.update(value);
      received += value.length;
      if (received > expected.size) {
        throw new Error(t('main.updates.installerMismatch'));
      }
      if (!file.write(value)) {
        await new Promise<void>((resolve) => file.once('drain', () => resolve()));
      }
      onPercent(Math.min(100, Math.round((received / expected.size) * 100)));
    }
    await new Promise<void>((resolve, reject) =>
      file.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
  } catch (error) {
    file.destroy();
    await reader.cancel().catch(() => {});
    await rm(partial, { force: true });
    throw error;
  }
  if (hash.digest('base64') !== expected.sha512) {
    await rm(partial, { force: true });
    throw new Error(t('main.updates.installerMismatch'));
  }
  await rename(partial, target);
}
