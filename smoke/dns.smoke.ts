import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

const loads = async (url: string): Promise<'loaded' | 'failed'> => {
  await copacetic.chrome.evaluate((target) => window.copacetic.tabs.create(target), url);
  const settled = await copacetic.waitForChrome(async () => {
    const state = await window.copacetic.chrome.getState();
    const tab = state.tabs.at(-1);
    return Boolean(tab && !tab.isLoading && (tab.error || tab.title));
  }, 40_000);
  expect(settled).toBe(true);
  const last = await copacetic.chrome.evaluate(async () => (await window.copacetic.chrome.getState()).tabs.at(-1));
  return last?.error ? 'failed' : 'loaded';
};

/**
 * Encrypted DNS was a pair of command-line switches read at startup, and the
 * only tests checked the strings. Nothing showed Chromium resolving through the
 * chosen provider, or that a change applied without a restart.
 */
describe('choosing encrypted DNS', () => {
  it('reconfigures the resolver straight away', async () => {
    await copacetic.main(({ app }) => {
      const calls: unknown[] = [];
      const original = app.configureHostResolver.bind(app);
      (globalThis as { resolverCalls?: unknown[] }).resolverCalls = calls;
      app.configureHostResolver = (options) => {
        calls.push(options);
        original(options);
      };
    });
    await copacetic.chrome.evaluate(() =>
      window.copacetic.settings.update({ dnsMode: 'encrypted', dnsResolverId: 'quad9' }),
    );
    const calls = await copacetic.main(() => (globalThis as { resolverCalls?: unknown[] }).resolverCalls ?? []);
    expect(calls.at(-1)).toEqual({ secureDnsMode: 'secure', secureDnsServers: ['https://dns.quad9.net/dns-query'] });
  }, 60_000);

  it('still loads pages through the chosen provider', async () => {
    expect(await loads('https://example.com/through-quad9')).toBe('loaded');
  }, 90_000);

  // The point of secure mode: an unreachable resolver means no answer, not a plaintext one.
  it('fails rather than falling back when the resolver cannot be reached', async () => {
    await copacetic.main(({ app }) => {
      app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: ['https://127.0.0.1:9/dns-query'] });
    });
    expect(await loads('https://example.org/never-resolved')).toBe('failed');

    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ dnsMode: 'system' }));
    expect(await loads('https://example.net/system-again')).toBe('loaded');
  }, 150_000);
});
