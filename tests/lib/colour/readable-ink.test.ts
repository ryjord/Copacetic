import { describe, expect, it } from 'vitest';
import { readableInkOn } from '@/lib/colour/readable-ink';

describe('the text colour that reads on a background', () => {
  it('is dark on a light colour and white on a dark one', () => {
    expect(readableInkOn('#f0e060')).toBe('#121519');
    expect(readableInkOn('#203040')).toBe('#ffffff');
  });

  // The muted group colours are mid-tones, where white fell under 4.5:1.
  it('is dark on the mid-grey and moss a profile can be given', () => {
    expect(readableInkOn('#7d8894')).toBe('#121519');
    expect(readableInkOn('#6f8f78')).toBe('#121519');
  });

  it('reads the short form, and falls back to white for what it cannot read', () => {
    expect(readableInkOn('#fff')).toBe('#121519');
    expect(readableInkOn('rebeccapurple')).toBe('#ffffff');
  });
});
