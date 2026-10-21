import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDateHeading,
  formatDuration,
  formatEta,
  formatRate,
  formatRelativeTime,
  timeOfDay,
} from '@/lib/text/format';

describe('formatBytes', () => {
  it.each([
    ['nothing', 0, '0 B'],
    ['a negative size', -5, '0 B'],
    ['a size that is not a number', Number.NaN, '0 B'],
    ['an infinite size', Number.POSITIVE_INFINITY, '0 B'],
    ['a single byte', 1, '1 B'],
    ['just under a kilobyte', 1023, '1023 B'],
    ['exactly a kilobyte, with a decimal below ten', 1024, '1.0 KB'],
    ['a kilobyte and a half', 1536, '1.5 KB'],
    ['ten kilobytes, with no decimal from ten up', 10 * 1024, '10 KB'],
    ['a megabyte and a bit', 1.4375 * 1024 ** 2, '1.4 MB'],
    ['a gigabyte', 1024 ** 3, '1.0 GB'],
    ['more than the largest unit, which stays in terabytes', 3 * 1024 ** 5, '3072 TB'],
  ])('shows %s', (_caseName, bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatRate', () => {
  it.each([
    ['an unknown rate', null, ''],
    ['a stalled rate', 0, ''],
    ['a negative rate', -1, ''],
    ['a real rate', 2048, '2.0 KB/s'],
  ])('shows %s', (_caseName, bytesPerSecond, expected) => {
    expect(formatRate(bytesPerSecond)).toBe(expected);
  });
});

describe('formatEta', () => {
  // The rate is a hundred bytes a second, so the bytes still to come set the time left.
  it.each([
    ['an unknown rate', 0, 6000, null, ''],
    ['a stalled rate', 0, 6000, 0, ''],
    ['an unknown total', 0, 0, 100, ''],
    ['a download that has already finished', 6000, 6000, 100, ''],
    ['a download that has received more than expected', 7000, 6000, 100, ''],
    ['seconds', 3000, 6000, 100, '30s left'],
    ['the last second below a minute', 100, 6000, 100, '59s left'],
    ['a minute', 0, 6000, 100, '1 min left'],
    ['minutes, rounded', 0, 9000, 100, '2 min left'],
    ['an hour', 0, 360_000, 100, '1 hr left'],
    ['hours, rounded', 0, 540_000, 100, '2 hr left'],
  ])('says %s', (_caseName, receivedBytes, totalBytes, bytesPerSecond, expected) => {
    expect(formatEta(receivedBytes, totalBytes, bytesPerSecond)).toBe(expected);
  });
});

describe('formatDuration', () => {
  it.each([
    ['nothing', 0, '0 ms'],
    ['a fraction of a second, rounded', 999.4, '999 ms'],
    ['exactly a second, to two places', 1000, '1.00 s'],
    ['under ten seconds, to two places', 9500, '9.50 s'],
    ['ten seconds, to one place', 10_000, '10.0 s'],
    ['a long wait, to one place', 12_345, '12.3 s'],
  ])('shows %s', (_caseName, milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });
});

describe('formatRelativeTime', () => {
  const now = 1_700_000_000_000;
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  // Built the same way the code builds it, so the words follow whichever locale the machine has.
  const said = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, unit);

  it.each([
    ['no time at all', 0],
    ['a moment ago', -44_999],
    ['a moment from now', 44_999],
  ])('says just now for %s', (_caseName, offset) => {
    expect(formatRelativeTime(now + offset, now)).toBe('just now');
  });

  it.each([
    ['the first second-level reading', -45 * SECOND, -45, 'second'],
    ['minutes ago', -2 * MINUTE, -2, 'minute'],
    ['hours ago', -3 * HOUR, -3, 'hour'],
    ['a day ago', -DAY, -1, 'day'],
    ['weeks ago', -14 * DAY, -2, 'week'],
    ['months ago', -90 * DAY, -3, 'month'],
    ['years ago', -800 * DAY, -2, 'year'],
    ['days from now', 3 * DAY, 3, 'day'],
  ] as const)('reads %s', (_caseName, offset, value, unit) => {
    expect(formatRelativeTime(now + offset, now)).toBe(said(value, unit));
  });
});

describe('formatDateHeading', () => {
  const now = new Date(2026, 9, 21, 15, 0, 0).getTime();

  it.each([
    ['earlier today', new Date(2026, 9, 21, 0, 5, 0).getTime(), 'Today'],
    ['late the night before', new Date(2026, 9, 20, 23, 0, 0).getTime(), 'Yesterday'],
  ])('calls %s by its name', (_caseName, timestamp, expected) => {
    expect(formatDateHeading(timestamp, now)).toBe(expected);
  });

  it('spells out an older day with its weekday', () => {
    const older = new Date(2026, 9, 14, 9, 0, 0);
    expect(formatDateHeading(older.getTime(), now)).toBe(
      older.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
    );
  });
});

describe('timeOfDay', () => {
  it.each([
    [0, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
  ])("calls %i o'clock the %s", (hour, expected) => {
    expect(timeOfDay(new Date(2026, 9, 21, hour, 30, 0))).toBe(expected);
  });
});
