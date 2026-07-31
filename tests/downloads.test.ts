import { describe, expect, it, vi } from 'vitest';

// `downloads.ts` imports electron for its manager class; the two pure helpers
// under test do not touch it, so a minimal stub keeps the import graph happy.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, shell: {} }));

const { sanitiseFilename } = await import('../electron/main/downloads');

describe('sanitiseFilename', () => {
  it('keeps an ordinary filename intact', () => {
    expect(sanitiseFilename('report.pdf')).toBe('report.pdf');
    expect(sanitiseFilename('My Notes (final).md')).toBe('My Notes (final).md');
  });

  it('strips directory components so a download cannot escape the folder', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitiseFilename('/absolute/path/file.txt')).toBe('file.txt');
  });

  it('refuses to produce a dotfile', () => {
    expect(sanitiseFilename('.bashrc')).toBe('bashrc');
    expect(sanitiseFilename('..')).toBe('download');
  });

  it('removes bidirectional overrides used to disguise an extension', () => {
    // U+202E (right-to-left override) makes `invoice<RLO>fdp.exe` render as
    // `invoiceexe.pdf` in a file list while still being an executable.
    const rlo = String.fromCharCode(0x202e);
    const cleaned = sanitiseFilename(`invoice${rlo}fdp.exe`);
    expect(cleaned).not.toContain(rlo);
    expect(cleaned).toBe('invoicefdp.exe');
  });

  it('removes control characters', () => {
    const nul = String.fromCharCode(0);
    const bell = String.fromCharCode(7);
    expect(sanitiseFilename(`safe${nul}name${bell}.txt`)).toBe('safename.txt');
  });

  it('replaces characters that are reserved in a path', () => {
    expect(sanitiseFilename('a:b*c?d"e<f>g|h.txt')).toBe('a_b_c_d_e_f_g_h.txt');
  });

  it('always returns something usable', () => {
    expect(sanitiseFilename('')).toBe('download');
    expect(sanitiseFilename('///')).toBe('download');
  });

  it('caps the length', () => {
    expect(sanitiseFilename('a'.repeat(500)).length).toBe(180);
  });
});
