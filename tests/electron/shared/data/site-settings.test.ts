import { describe, expect, it } from 'vitest';
import { withSiteRestored, withoutSite } from '../../../../electron/shared/data/site-settings';

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

describe('resetting one site', () => {
  it('forgets everything about that site and nothing about any other', () => {
    const patch = withoutSite(kept, 'example.com');
    expect(Object.keys(patch.permissionDecisions)).toEqual([
      'https://news.example.org|notifications',
      'https://broken|nonsense',
    ]);
    expect(patch.zoomLevels).toEqual({});
    expect(patch.blockerAllowlist).toEqual(['shop.example.net']);
    expect(patch.openRules).toEqual({ 'bank.example': 'hush' });
  });

  it('lets a site open anywhere again when its rule was all there was', () => {
    expect(withoutSite(kept, 'bank.example').openRules).toEqual({});
  });

  it('forgets a tracker exception when that is all there was', () => {
    expect(withoutSite(kept, 'shop.example.net').blockerAllowlist).toEqual([]);
  });
});

describe('undoing a reset', () => {
  // Put back over what is kept now, so a change made to another site in the meantime survives the undo.
  it('brings that site back and leaves every other change alone', () => {
    const reset = withoutSite(kept, 'example.com');
    const since = { ...reset, zoomLevels: { 'https://news.example.org': 1.5 } };
    const restored = withSiteRestored(since, kept, 'example.com');
    expect(restored.permissionDecisions).toEqual(kept.permissionDecisions);
    expect(restored.zoomLevels).toEqual({ 'https://news.example.org': 1.5, 'https://docs.example.com': 1.25 });
    expect(restored.openRules).toEqual(kept.openRules);
  });
});
