const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  // One decimal place below 10 keeps "1.4 MB" readable without "1.437 MB".
  const decimals = exponent === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[exponent]}`;
}

export function formatRate(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null || bytesPerSecond <= 0) return '';
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** Remaining time for a download, or an empty string when it is unknowable. */
export function formatEta(receivedBytes: number, totalBytes: number, bytesPerSecond: number | null): string {
  if (!bytesPerSecond || bytesPerSecond <= 0 || totalBytes <= 0) return '';
  const seconds = Math.round((totalBytes - receivedBytes) / bytesPerSecond);
  if (seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s left`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min left`;
  return `${Math.round(seconds / 3600)} hr left`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 1000],
  ['minute', 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['year', 365 * 24 * 60 * 60 * 1000],
];

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = timestamp - now;
  const magnitude = Math.abs(elapsed);
  if (magnitude < 45_000) return 'just now';

  let chosen: [Intl.RelativeTimeFormatUnit, number] = RELATIVE_UNITS[0]!;
  for (const candidate of RELATIVE_UNITS) {
    if (magnitude >= candidate[1]) chosen = candidate;
  }
  return relativeFormatter.format(Math.round(elapsed / chosen[1]), chosen[0]);
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateHeading(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  const isSameDay = date.toDateString() === today.toDateString();
  if (isSameDay) return 'Today';

  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Milliseconds, shown the way a network panel would show them. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}
