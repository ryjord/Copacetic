import { describe, expect, it } from 'vitest';
import { addressOf, describeRequest } from '../../../../electron/main/system/request-log';

const at = new Date('2026-10-21T09:00:00.000Z');

describe('the sign-in request record', () => {
  // A query can carry a token or an email address, so it never reaches the record.
  it.each([
    [
      'https://accounts.google.com/v3/signin/identifier?continue=x&email=a%40b.com#frag',
      'https://accounts.google.com/v3/signin/identifier',
    ],
    ['wss://example.com/socket?token=secret', 'wss://example.com/socket'],
    ['ws://localhost:8080/live?session=1', 'ws://localhost:8080/live'],
    ['data:text/html,<b>hi</b>', 'data:'],
    ['not a url', 'unreadable'],
  ])('keeps %s as %s', (url, address) => {
    expect(addressOf(url)).toBe(address);
  });

  it('records a page and what came back', () => {
    const line = describeRequest(
      { url: 'https://accounts.google.com/signin?x=1', method: 'GET', resourceType: 'mainFrame', statusCode: 403 },
      'persist:copacetic-web',
      at,
    );
    expect(line).toBe(
      '2026-10-21T09:00:00.000Z\tpersist:copacetic-web\tmainFrame\tGET\t403\thttps://accounts.google.com/signin',
    );
  });

  it('records why a request failed', () => {
    const line = describeRequest(
      {
        url: 'https://accounts.google.com/x',
        method: 'POST',
        resourceType: 'xhr',
        error: 'net::ERR_CONNECTION_RESET',
      },
      'persist:copacetic-web',
      at,
    );
    expect(line?.split('\t')[4]).toBe('net::ERR_CONNECTION_RESET');
  });

  it('leaves out images and scripts that loaded, but keeps one that failed', () => {
    const image = { url: 'https://ssl.gstatic.com/logo.png', method: 'GET', resourceType: 'image' };
    expect(describeRequest({ ...image, statusCode: 200 }, 'persist:copacetic-web', at)).toBeNull();
    expect(describeRequest({ ...image, statusCode: 404 }, 'persist:copacetic-web', at)).not.toBeNull();
  });
});
