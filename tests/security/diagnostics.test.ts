import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Diagnostics, describeError, scrub } from '../../electron/main/system/diagnostics';

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-diag-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = () => readFileSync(path.join(dir, 'diagnostics.log'), 'utf8');

/**
 * A log is only useful if someone will send it to you, and they will only do
 * that if it holds nothing they would mind sharing. These are the rules that
 * make that true whatever a call site passes.
 */
describe('nothing written down identifies where someone has been', () => {
  it('keeps the scheme of an address and drops the rest', () => {
    expect(scrub('failed to load https://embarrassing.example/page?q=secret')).toBe(
      'failed to load https://<address>',
    );
  });

  it('does the same for every address in a line', () => {
    expect(scrub('http://one.example redirected to https://two.example')).toBe(
      'http://<address> redirected to https://<address>',
    );
  });

  it('removes anything shaped like a key or a token', () => {
    expect(scrub('token AKIAIOSFODNN7EXAMPLEKEYVALUE123 rejected')).toBe('token <redacted> rejected');
  });

  it('scrubs values that arrive through fields, not just the event', () => {
    new Diagnostics(dir).error('load failed', { url: 'https://private.example/path' });
    expect(read()).toContain('url=https://<address>');
    expect(read()).not.toContain('private.example');
  });

  it('scrubs the event name too', () => {
    new Diagnostics(dir).info('navigating to https://private.example');
    expect(read()).not.toContain('private.example');
  });

  // A stack trace names the machine it ran on, and often the person.
  it('takes an error’s name and message but never its stack', () => {
    const error = new Error('could not open https://private.example');
    const fields = describeError(error);

    expect(fields.error).toBe('Error');
    expect(Object.keys(fields)).not.toContain('stack');

    new Diagnostics(dir).error('failed', fields);
    expect(read()).not.toContain('private.example');
    expect(read()).not.toContain('diagnostics.test');
  });

  it('keeps a single value from growing without limit', () => {
    new Diagnostics(dir).info('long', { detail: 'x'.repeat(5000) });
    expect(read().length).toBeLessThan(500);
  });
});

describe('what a line says', () => {
  it('carries the time, the level and the event', () => {
    new Diagnostics(dir, () => Date.UTC(2026, 7, 28, 9, 30, 0)).warn('update check failed', { attempt: 2 });
    expect(read().trim()).toBe('2026-08-28T09:30:00.000Z WARN update check failed attempt=2');
  });

  it('leaves out fields that were never set', () => {
    new Diagnostics(dir).info('started', { version: '1.3.3', channel: undefined });
    expect(read()).toContain('version=1.3.3');
    expect(read()).not.toContain('channel');
  });

  it('appends rather than replacing what came before', () => {
    const diagnostics = new Diagnostics(dir);
    diagnostics.info('first');
    diagnostics.info('second');
    expect(read().trim().split('\n')).toHaveLength(2);
  });
});

describe('it cannot grow until it is a problem of its own', () => {
  it('starts a new file once the current one is large, keeping the last one', () => {
    const diagnostics = new Diagnostics(dir, Date.now, 300);
    for (let index = 0; index < 20; index += 1) {
      diagnostics.info(`event number ${index}`);
    }

    expect(existsSync(path.join(dir, 'diagnostics.log.1'))).toBe(true);
    expect(read().length).toBeLessThanOrEqual(300);
  });

  // Only the previous file is kept, so the oldest events are meant to be gone.
  // What must hold is that reading spans further back than the current file.
  it('reads back further than the current file, so a restart is not a blind spot', () => {
    const diagnostics = new Diagnostics(dir, Date.now, 300);
    for (let index = 0; index < 20; index += 1) {
      diagnostics.info(`event number ${index}`);
    }

    const current = diagnostics.read();
    const everything = diagnostics.readAll();

    expect(everything).toContain('event number 19');
    expect(everything.length).toBeGreaterThan(current.length);
    // Something that has already left the current file is still readable.
    const rotatedOut = everything.replace(current, '');
    expect(rotatedOut).toMatch(/event number \d+/);
  });

  it('forgets everything when asked', () => {
    const diagnostics = new Diagnostics(dir, Date.now, 300);
    for (let index = 0; index < 20; index += 1) {
      diagnostics.info(`event ${index}`);
    }
    diagnostics.clear();
    expect(diagnostics.readAll()).toBe('');
  });
});

// Logging is what happens when things are already going wrong.
describe('logging never becomes the failure', () => {
  it('does not throw when the directory cannot be written', () => {
    const diagnostics = new Diagnostics('/proc/nowhere-copacetic-could-write');
    expect(() => diagnostics.error('something failed')).not.toThrow();
  });

  it('reads as empty rather than throwing when there is no log yet', () => {
    expect(new Diagnostics(dir).read()).toBe('');
    expect(new Diagnostics(dir).readAll()).toBe('');
  });
});
