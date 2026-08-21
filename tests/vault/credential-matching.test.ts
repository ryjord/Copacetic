import { describe, expect, it } from 'vitest';
import { entriesForPage, isFillablePage, offerFor } from '../../electron/shared/credential-matching';

const saved = (origin: string, id = origin) => ({ id, origin, username: 'riley' });

/**
 * A password typed into a plain http page is readable by anyone on the network.
 * Filling one there would be Copacetic putting it at risk rather than the person
 * choosing to.
 */
describe('pages a password may be put into', () => {
  it.each([
    ['an encrypted page', 'https://example.com/login'],
    ['a local development server', 'http://localhost:3000/login'],
    ['loopback by address', 'http://127.0.0.1:8080/login'],
  ])('allows %s', (_name, url) => {
    expect(isFillablePage(url)).toBe(true);
  });

  it.each([
    ['a plain http page', 'http://example.com/login'],
    ['a file on disk', 'file:///tmp/login.html'],
    ['an internal page', 'copacetic://start'],
    ['nonsense', 'not a url'],
  ])('refuses %s', (_name, url) => {
    expect(isFillablePage(url)).toBe(false);
  });

  it('explains the refusal rather than saying nothing is saved', () => {
    const offer = offerFor('http://example.com/login', [saved('https://example.com')]);
    expect(offer.entries).toEqual([]);
    expect(offer.refusal).toContain('not encrypted');
  });
});

/**
 * The rule that matters most. A password offered on the wrong site is handed to
 * whoever asked for it and cannot be taken back.
 */
describe('which saved passwords belong to a page', () => {
  it('matches the same site', () => {
    expect(entriesForPage('https://example.com/login', [saved('https://example.com')])).toHaveLength(1);
  });

  it('matches a sign-in subdomain of the same site', () => {
    expect(entriesForPage('https://accounts.example.com/login', [saved('https://example.com')])).toHaveLength(1);
  });

  it('matches when the password was saved on the subdomain instead', () => {
    expect(entriesForPage('https://example.com/login', [saved('https://accounts.example.com')])).toHaveLength(1);
  });

  it.each([
    ['a different site', 'https://evil.test/login', 'https://example.com'],
    ['a lookalike', 'https://example.com.evil.test/login', 'https://example.com'],
    ['a suffix of the name', 'https://notexample.com/login', 'https://example.com'],
  ])('offers nothing on %s', (_name, page, savedOrigin) => {
    expect(entriesForPage(page, [saved(savedOrigin)])).toEqual([]);
  });

  /**
   * The public suffix list is what makes registrable-domain matching safe. On a
   * host like github.io every user gets their own registrable domain, so one
   * person's page cannot claim another's password.
   */
  it('does not let one user of a hosting domain claim another', () => {
    expect(entriesForPage('https://attacker.github.io/x', [saved('https://victim.github.io')])).toEqual([]);
  });

  it('still matches the same user on such a domain', () => {
    expect(entriesForPage('https://victim.github.io/x', [saved('https://victim.github.io')])).toHaveLength(1);
  });

  it('offers every account saved for the site', () => {
    const entries = [saved('https://example.com', 'one'), saved('https://accounts.example.com', 'two')];
    expect(offerFor('https://example.com/login', entries).entries).toHaveLength(2);
  });

  it('says nothing is saved rather than offering something else', () => {
    const offer = offerFor('https://other.test/login', [saved('https://example.com')]);
    expect(offer.entries).toEqual([]);
    expect(offer.refusal).toBe('Nothing saved for this site.');
  });
});
