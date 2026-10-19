// Chromium counts microseconds from 1601, the Windows epoch, which is this many milliseconds before 1970.
export const WINDOWS_EPOCH_OFFSET_MS = 11_644_473_600_000;

/** Milliseconds since 1970, from Chromium's microseconds since 1601; null for nothing usable. */
export function millisecondsFromChromiumTime(value: unknown): number | null {
  const microseconds = typeof value === 'string' ? Number(value) : value;
  if (typeof microseconds !== 'number' || !Number.isFinite(microseconds) || microseconds <= 0) {
    return null;
  }
  return Math.round(microseconds / 1000) - WINDOWS_EPOCH_OFFSET_MS;
}
