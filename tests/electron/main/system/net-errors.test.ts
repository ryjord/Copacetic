import { describe, expect, it } from 'vitest';
import { describeNetError, isAbortError } from '../../../../electron/main/system/net-errors';

/**
 * The symbolic name is shown so a person can search for it, which only helps if
 * it is the name Chromium actually uses. A wrong one sends them to results for
 * a different failure than the one they had.
 */
describe('the names shown for Chromium error codes', () => {
  it.each([
    [-6, 'ERR_FILE_NOT_FOUND'],
    [-7, 'ERR_TIMED_OUT'],
    [-100, 'ERR_CONNECTION_CLOSED'],
    [-101, 'ERR_CONNECTION_RESET'],
    [-102, 'ERR_CONNECTION_REFUSED'],
    [-105, 'ERR_NAME_NOT_RESOLVED'],
    [-106, 'ERR_INTERNET_DISCONNECTED'],
    [-200, 'ERR_CERT_COMMON_NAME_INVALID'],
    [-201, 'ERR_CERT_DATE_INVALID'],
    [-202, 'ERR_CERT_AUTHORITY_INVALID'],
    [-501, 'ERR_INSECURE_RESPONSE'],
  ])('maps %i to %s', (code, name) => {
    expect(describeNetError(code, '').name).toBe(name);
  });
});

describe('errors it has never seen', () => {
  it('builds a name from the code rather than claiming a wrong one', () => {
    expect(describeNetError(-99999, '').name).toBe('ERR_99999');
  });

  it('uses Chromium’s own description when there is one', () => {
    expect(describeNetError(-99999, 'net::ERR_SOMETHING_NEW').description).toBe('net::ERR_SOMETHING_NEW');
  });

  it('still says something when Chromium says nothing', () => {
    const described = describeNetError(-99999, '');
    expect(described.description.length).toBeGreaterThan(0);
    expect(described.headline.length).toBeGreaterThan(0);
  });
});

/**
 * Navigating away cancels the load in flight. Treating that as a failure would
 * put an error page over the page the user actually asked for.
 */
describe('telling a cancelled load from a broken one', () => {
  it.each([
    [-3, true],
    [0, true],
    [-2, false],
    [-6, false],
    [-105, false],
    [-201, false],
  ])('treats %i as abort: %s', (code, isAbort) => {
    expect(isAbortError(code)).toBe(isAbort);
  });
});
