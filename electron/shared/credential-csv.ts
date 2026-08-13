// The format every other password manager reads and writes — plain text, so the interface says so.
import { hostOf } from './url';

export interface CsvCredential {
  origin: string;
  username: string;
  password: string;
}

export interface ImportedCredentials {
  credentials: CsvCredential[];
  /** Rows that were not credentials, so a count that is short is explained rather than silent. */
  skipped: number;
}

/** Chrome's header, which Firefox, Bitwarden and 1Password all import. */
const COLUMNS = ['name', 'url', 'username', 'password'] as const;

/** The names other managers give the same three columns. */
const ALIASES: Record<string, readonly string[]> = {
  url: ['url', 'login_uri', 'website', 'site', 'web site', 'urls'],
  username: ['username', 'login_username', 'user', 'email', 'login', 'account'],
  password: ['password', 'login_password', 'pass'],
};

// A leading one of these is how a spreadsheet decides a cell is a formula, not text.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function quote(value: string): string {
  const safe = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  // Only where it changes the meaning, so an ordinary file stays readable.
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function credentialsToCsv(credentials: readonly CsvCredential[]): string {
  const lines = [COLUMNS.join(',')];
  for (const credential of credentials) {
    lines.push(
      [hostOf(credential.origin) || credential.origin, credential.origin, credential.username, credential.password]
        .map(quote)
        .join(','),
    );
  }
  // A trailing newline: some importers drop the last row without one.
  return `${lines.join('\n')}\n`;
}

// Splits on commas/newlines outside quotes; a password may contain either.
function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      // Treat CRLF as one break rather than an empty row between them.
      if (character === '\r' && text[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value !== ''));
}

function columnIndexes(header: readonly string[]): { url: number; username: number; password: number } | null {
  const normalised = header.map((name) => name.trim().toLowerCase().replace(/^"|"$/g, ''));
  const find = (key: keyof typeof ALIASES) => normalised.findIndex((name) => ALIASES[key]?.includes(name) ?? false);

  const url = find('url');
  const password = find('password');
  if (url === -1 || password === -1) {
    return null;
  }
  return { url, username: find('username'), password };
}

export function credentialsFromCsv(text: string): ImportedCredentials {
  const rows = parseRows(text);
  const header = rows[0];
  if (!header) {
    return { credentials: [], skipped: 0 };
  }

  const columns = columnIndexes(header);
  if (!columns) {
    // Without a header there is no way to tell a username from a password, and
    // guessing by position would store one as the other.
    return { credentials: [], skipped: rows.length };
  }

  const credentials: CsvCredential[] = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const origin = (row[columns.url] ?? '').trim();
    const password = row[columns.password] ?? '';
    if (!origin || !password) {
      skipped += 1;
      continue;
    }
    credentials.push({
      origin,
      username: (columns.username === -1 ? '' : (row[columns.username] ?? '')).trim(),
      password,
    });
  }

  return { credentials, skipped };
}
