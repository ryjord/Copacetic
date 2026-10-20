import { describe, expect, it } from 'vitest';
import { sitesFrom, summaryOf, originFromInput } from '@/components/views/settings/sites/siteSettings';

const kept = {
  permissionDecisions: {
    'https://maps.example.com|geolocation': 'allow',
    'https://www.example.com|notifications': 'deny',
    'https://news.example.org|notifications': 'allow',
    'https://broken|nonsense': 'allow',
  } as const,
  zoomLevels: { 'https://docs.example.com': 1.25 },
  blockerAllowlist: ['shop.example.net'],
  openRules: { 'bank.example': 'hush' } as const,
};

describe('what is kept about each site', () => {
  // A subdomain is the same site, so maps. and www. are listed together rather than as strangers.
  it('gathers every origin of a site under the site', () => {
    const [example] = sitesFrom(kept).filter((site) => site.site === 'example.com');
    expect(example?.permissions.map((permission) => permission.origin).sort()).toEqual([
      'https://maps.example.com',
      'https://www.example.com',
    ]);
    expect(example?.zoomLevels).toEqual([{ origin: 'https://docs.example.com', zoomFactor: 1.25 }]);
  });

  it('lists each site once, alphabetically, with tracker exceptions among them', () => {
    expect(sitesFrom(kept).map((site) => site.site)).toEqual([
      'bank.example',
      'example.com',
      'example.org',
      'shop.example.net',
    ]);
    expect(sitesFrom(kept).find((site) => site.site === 'shop.example.net')?.allowsTrackers).toBe(true);
  });

  it('ignores a decision about a permission this build does not have', () => {
    expect(sitesFrom(kept).some((site) => site.site.includes('broken'))).toBe(false);
  });

  it('says in one line what is kept', () => {
    const example = sitesFrom(kept).find((site) => site.site === 'example.com')!;
    expect(summaryOf(example)).toBe('Location allowed · Notifications blocked · Zoom 125%');
  });
});

describe('reading a site someone typed', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['  mail.example.com/inbox ', 'https://mail.example.com'],
    ['http://intranet.example.org:8080/x', 'http://intranet.example.org:8080'],
  ])('%s is kept as %s', (input, origin) => {
    expect(originFromInput(input)).toBe(origin);
  });

  it.each(['', 'not a site', 'localhost', 'javascript:alert(1)', 'file:///etc/hosts'])(
    '%s is not a site',
    (input) => {
      expect(originFromInput(input)).toBeNull();
    },
  );
});
