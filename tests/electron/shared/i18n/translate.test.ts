import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../electron/shared/i18n/en', () => ({
  en: {
    greeting: 'Hello, {name}',
    tabs: { one: '{count} tab', other: '{count} tabs' },
    nested: { deeper: { message: 'Found it' } },
  },
}));

const { t } = await import('../../../../electron/shared/i18n/translate');
// The fixture catalogue's keys are not the real catalogue's, which is what the type checks.
const key = (value: string) => value as Parameters<typeof t>[0];

describe('t', () => {
  it('fills placeholders by name', () => {
    expect(t(key('greeting'), { name: 'Riley' })).toBe('Hello, Riley');
  });

  it('leaves a placeholder it was given nothing for, so the gap shows', () => {
    expect(t(key('greeting'))).toBe('Hello, {name}');
  });

  it('chooses the plural form by count', () => {
    expect(t(key('tabs'), { count: 1 })).toBe('1 tab');
    expect(t(key('tabs'), { count: 0 })).toBe('0 tabs');
    expect(t(key('tabs'), { count: 3 })).toBe('3 tabs');
  });

  it('follows a dotted path', () => {
    expect(t(key('nested.deeper.message'))).toBe('Found it');
  });

  it('shows the key itself for a message the catalogue lacks', () => {
    expect(t(key('nested.missing'))).toBe('nested.missing');
    expect(t(key('nested'))).toBe('nested');
  });
});
