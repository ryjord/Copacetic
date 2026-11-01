// Utils
import { app } from '../engine/app';
import { t } from '../../shared/i18n/translate';

// Types
import type { FetchBytes } from './installer';

/**
 * A store download, with no cookies and no other browsing on it: Node's own
 * fetch rather than a session's, so asking Google for an extension says
 * nothing about what else this browser has done.
 */
export const fetchFromWebStore: FetchBytes = async (url, maxBytes) => {
  const response = await fetch(url, {
    credentials: 'omit',
    redirect: 'follow',
    headers: { 'User-Agent': `Copacetic/${app.getVersion()}` },
  });
  if (!response.ok) {
    throw new Error(t('main.extensions.install.storeAnswered', { status: response.status }));
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(t('main.extensions.install.notAnExtension'));
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks);
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(t('main.extensions.install.tooLarge'));
    }
    chunks.push(value);
  }
};
