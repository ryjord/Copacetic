import { describe, expect, it } from 'vitest';
import { credentialsFromCsv, credentialsToCsv, type CsvCredential } from '../electron/shared/credential-csv';

const one = (overrides: Partial<CsvCredential> = {}): CsvCredential => ({
  origin: 'https://example.com',
  username: 'riley',
  password: 'hunter2',
  ...overrides,
});

describe('writing the file', () => {
  it('writes the header every other manager expects', () => {
    expect(credentialsToCsv([]).trim()).toBe('name,url,username,password');
  });

  it('names the row after the host, which is what a person recognises', () => {
    expect(credentialsToCsv([one()])).toContain('example.com,https://example.com,riley,hunter2');
  });

  it('ends with a newline, because some importers drop the last row without one', () => {
    expect(credentialsToCsv([one()]).endsWith('\n')).toBe(true);
  });

  it('leaves ordinary values unquoted so the file stays readable', () => {
    expect(credentialsToCsv([one()])).not.toContain('"');
  });
});

/**
 * The failure this file exists to prevent. A password containing a comma, a
 * quote or a newline is perfectly legal and splitting on commas turns one field
 * into two — which does not fail loudly, it stores the wrong password and is
 * only discovered next time someone tries to sign in.
 */
describe('passwords that would break a naive split', () => {
  it.each([
    ['a comma', 'pass,word'],
    ['a double quote', 'pass"word'],
    ['both', 'a,b"c'],
    ['a newline', 'line-one\nline-two'],
    ['a carriage return and newline', 'line-one\r\nline-two'],
    ['leading and trailing spaces', '  spaced  '],
    ['only quotes', '""""'],
    ['a whole CSV row', 'x,y,z\nhttps://evil.test,attacker,letmein'],
  ])('survives a round trip: %s', (_name, password) => {
    const csv = credentialsToCsv([one({ password })]);
    const back = credentialsFromCsv(csv);
    expect(back.credentials).toHaveLength(1);
    expect(back.credentials[0]?.password).toBe(password);
  });

  // A password is opaque bytes. Normalising line endings inside one — which a
  // CSV reader is otherwise entitled to do between rows — would change it, and
  // the change would only surface as a failed sign-in.
  it('does not normalise line endings inside a password', () => {
    const back = credentialsFromCsv(credentialsToCsv([one({ password: 'a\r\nb' })]));
    expect(back.credentials[0]?.password).toBe('a\r\nb');
  });

  it('survives a username with a comma too', () => {
    const back = credentialsFromCsv(credentialsToCsv([one({ username: 'last, first' })]));
    expect(back.credentials[0]?.username).toBe('last, first');
  });

  it('round trips several at once without bleeding between rows', () => {
    const rows = [
      one({ origin: 'https://a.test', username: 'one', password: 'has,comma' }),
      one({ origin: 'https://b.test', username: 'two', password: 'has"quote' }),
      one({ origin: 'https://c.test', username: 'three', password: 'plain' }),
    ];
    expect(credentialsFromCsv(credentialsToCsv(rows)).credentials).toEqual(rows);
  });
});

describe('reading a file another manager wrote', () => {
  it('reads Chrome, which is the format we also write', () => {
    const csv = 'name,url,username,password\nExample,https://example.com,riley,hunter2\n';
    expect(credentialsFromCsv(csv).credentials).toEqual([one()]);
  });

  it.each([
    ['Bitwarden', 'login_uri,login_username,login_password\nhttps://example.com,riley,hunter2\n'],
    ['a website column', 'website,username,password\nhttps://example.com,riley,hunter2\n'],
    ['an email column', 'url,email,password\nhttps://example.com,riley,hunter2\n'],
    ['columns in another order', 'password,url,username\nhunter2,https://example.com,riley\n'],
    ['a header in capitals', 'URL,Username,Password\nhttps://example.com,riley,hunter2\n'],
  ])('reads %s', (_name, csv) => {
    expect(credentialsFromCsv(csv).credentials).toEqual([one()]);
  });

  it('reads a file with Windows line endings', () => {
    const csv = 'url,username,password\r\nhttps://example.com,riley,hunter2\r\n';
    expect(credentialsFromCsv(csv).credentials).toEqual([one()]);
  });

  it('keeps a row that has no username, which some sites genuinely have', () => {
    const csv = 'url,username,password\nhttps://example.com,,hunter2\n';
    expect(credentialsFromCsv(csv).credentials).toEqual([one({ username: '' })]);
  });
});

/**
 * A count that is short has to be explained. Silently dropping rows is how
 * someone believes their passwords moved across when some of them did not.
 */
describe('rows it cannot use', () => {
  it('counts a row with no password rather than importing it empty', () => {
    const csv = 'url,username,password\nhttps://example.com,riley,\nhttps://ok.test,riley,hunter2\n';
    const result = credentialsFromCsv(csv);
    expect(result.credentials).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it('counts a row with no site', () => {
    const csv = 'url,username,password\n,riley,hunter2\n';
    expect(credentialsFromCsv(csv)).toMatchObject({ credentials: [], skipped: 1 });
  });

  // Guessing by position would file a username as a password.
  it('imports nothing from a file with no recognisable header', () => {
    const csv = 'a,b,c\nhttps://example.com,riley,hunter2\n';
    const result = credentialsFromCsv(csv);
    expect(result.credentials).toEqual([]);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it.each([
    ['nothing at all', ''],
    ['only whitespace', '\n\n'],
  ])('reads %s without falling over', (_name, csv) => {
    expect(credentialsFromCsv(csv).credentials).toEqual([]);
  });

  it('ignores blank lines between rows', () => {
    const csv = 'url,username,password\nhttps://example.com,riley,hunter2\n\n\n';
    expect(credentialsFromCsv(csv)).toMatchObject({ credentials: [one()], skipped: 0 });
  });
});
