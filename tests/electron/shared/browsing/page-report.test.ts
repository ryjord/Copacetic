import { describe, expect, it } from 'vitest';
import { pageReportFileName, pageReportFrom } from '../../../../electron/shared/browsing/page-report';

const now = Date.UTC(2026, 9, 19, 12);

describe('pageReportFrom', () => {
  const report = pageReportFrom({
    url: 'https://news.example/story',
    title: 'A story',
    now,
    version: '2.0.0-beta.2',
    isBlocking: true,
    entries: [
      { host: 'cdn.news.example', requests: 30, blocked: 0, isTracker: false },
      { host: 'tracker.example', requests: 4, blocked: 4, isTracker: true, rule: '||tracker.example^' },
      { host: 'pixel.example', requests: 2, blocked: 2, isTracker: true },
    ],
  });

  it('says what was contacted, busiest first, and what stopped each one', () => {
    expect(report.hosts.map((host) => host.host)).toEqual(['cdn.news.example', 'tracker.example', 'pixel.example']);
    expect(report.hosts[1]?.blockedBy).toBe('||tracker.example^');
    expect(report.hosts[2]?.blockedBy).toBe('hostname');
    expect(report.hosts[0]?.blockedBy).toBeNull();
  });

  it('adds it up, and says who made it and when', () => {
    expect(report.summary).toEqual({ hosts: 3, requests: 36, blockedHosts: 2, blockedRequests: 6 });
    expect(report.madeAt).toBe('2026-10-19T12:00:00.000Z');
    expect(report.madeBy).toBe('Copacetic 2.0.0-beta.2');
  });
});

describe('pageReportFileName', () => {
  it('is named for the site and the day', () => {
    expect(pageReportFileName('https://www.news.example/story', now)).toBe(
      'news.example-connections-2026-10-19.json',
    );
    expect(pageReportFileName('not an address', now)).toBe('page-connections-2026-10-19.json');
  });
});
