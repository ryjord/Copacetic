import { describe, expect, it } from 'vitest';
import {
  credentialsFromCsv,
  credentialsToCsv,
  type CsvCredential,
} from '../../../../electron/shared/passwords/credential-csv';

const one = (overrides: Partial<CsvCredential> = {}): CsvCredential => ({
  origin: 'https://example.com',
  username: 'riley',
  password: 'hunter2',
  ...overrides,
});

describe('writing the file', () => {
  // The header every other manager expects, a row named after its host, a final newline and no quoting.
  it('writes exactly the plain file other managers expect', () => {
    expect(credentialsToCsv([])).toBe('name,url,username,password\n');
    expect(credentialsToCsv([one()])).toBe(
      'name,url,username,password\nexample.com,https://example.com,riley,hunter2\n',
    );
  });
});

/**
 * The failure this file exists to prevent. A password containing a comma, a
 * quote or a newline is perfectly legal and splitting on commas turns one field
 * into two - which does not fail loudly, it stores the wrong password and is
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
  it.each([
    [
      'Chrome, which is the format we also write',
      'name,url,username,password\nExample,https://example.com,riley,hunter2\n',
      [one()],
    ],
    ['Bitwarden', 'login_uri,login_username,login_password\nhttps://example.com,riley,hunter2\n', [one()]],
    ['a website column', 'website,username,password\nhttps://example.com,riley,hunter2\n', [one()]],
    ['an email column', 'url,email,password\nhttps://example.com,riley,hunter2\n', [one()]],
    ['columns in another order', 'password,url,username\nhunter2,https://example.com,riley\n', [one()]],
    ['a header in capitals', 'URL,Username,Password\nhttps://example.com,riley,hunter2\n', [one()]],
    ['a file with Windows line endings', 'url,username,password\r\nhttps://example.com,riley,hunter2\r\n', [one()]],
    [
      'a row that has no username, which some sites genuinely have',
      'url,username,password\nhttps://example.com,,hunter2\n',
      [one({ username: '' })],
    ],
    ['blank lines between rows', 'url,username,password\nhttps://example.com,riley,hunter2\n\n\n', [one()]],
    ['nothing at all', '', []],
    ['only whitespace', '\n\n', []],
  ])('reads %s', (_caseName, csv, expected) => {
    expect(credentialsFromCsv(csv).credentials).toEqual(expected);
  });
});

/**
 * A count that is short has to be explained. Silently dropping rows is how
 * someone believes their passwords moved across when some of them did not.
 */
describe('rows it cannot use', () => {
  // Guessing by position would file a username as a password, hence the unrecognised header.
  it.each([
    [
      'a row with no password rather than importing it empty',
      'url,username,password\nhttps://example.com,riley,\nhttps://ok.test,riley,hunter2\n',
      [one({ origin: 'https://ok.test' })],
      1,
    ],
    ['a row with no site', 'url,username,password\n,riley,hunter2\n', [], 1],
    ['a file with no recognisable header', 'a,b,c\nhttps://example.com,riley,hunter2\n', [], 2],
  ])('counts %s', (_caseName, csv, credentials, skipped) => {
    expect(credentialsFromCsv(csv)).toEqual({ credentials, skipped });
  });
});

// A guard that stays on the way back in changes a password, and the generator makes ones that start with - or @.
describe('the formula guard', () => {
  it('leaves passwords exactly as they are', () => {
    const csv = credentialsToCsv([{ origin: 'https://a.test', username: 'one', password: '=1+2' }]);
    expect(csv).toContain(',=1+2');
    expect(credentialsFromCsv(csv).credentials[0]?.password).toBe('=1+2');
  });

  it('still guards the fields a site could have shaped, and takes the guard back on import', () => {
    const csv = credentialsToCsv([{ origin: 'https://a.test', username: '=HYPERLINK("x")', password: 'secret' }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(credentialsFromCsv(csv).credentials[0]?.username).toBe('=HYPERLINK("x")');
  });

  it('round trips passwords that begin with every formula character', () => {
    const credentials = ['-dash', '@at', '+plus', '=equals'].map((password, index) => ({
      origin: `https://site${index}.test`,
      username: 'riley',
      password,
    }));
    expect(credentialsFromCsv(credentialsToCsv(credentials)).credentials.map((each) => each.password)).toEqual([
      '-dash',
      '@at',
      '+plus',
      '=equals',
    ]);
  });
});
