import { describe, expect, it } from 'vitest';
import { matchScore, rankByMatch } from '@/lib/fuzzy';

const LABELS = ['New tab', 'New Hush tab', 'Open settings', 'Reset zoom', 'Switch to Settings - Example'];

describe('finding a command by what was typed', () => {
  it('puts a label that starts with it first', () => {
    expect(rankByMatch(LABELS, 'new', (label) => label)[0]).toBe('New tab');
  });

  it('finds a word that starts with it, anywhere in the label', () => {
    expect(rankByMatch(LABELS, 'sett', (label) => label)).toEqual(['Open settings', 'Switch to Settings - Example']);
  });

  it('finds letters typed in order, as initials', () => {
    expect(rankByMatch(LABELS, 'nht', (label) => label)).toEqual(['New Hush tab']);
  });

  it('matches nothing that does not contain the letters', () => {
    expect(matchScore('Reset zoom', 'xyz')).toBeNull();
  });

  it('keeps everything, in order, when nothing is typed', () => {
    expect(rankByMatch(LABELS, '  ', (label) => label)).toEqual(LABELS);
  });
});
