import { describe, expect, it } from 'vitest';
import { ClosedTabs } from '../../../../electron/main/tabs/closed-tabs';

const tab = (url: string, index = 0) => ({ url, title: url, index, groupId: null, isPinned: false });

describe('what can be reopened', () => {
  // Reopening a closed group used to bring its tabs back one at a time, ungrouped.
  it('keeps a closed group as one entry', () => {
    const closed = new ClosedTabs();
    closed.remember(tab('https://alone.example/'));
    closed.beginGroup({ name: 'Work', colour: 'moss', ownSession: false });
    closed.remember(tab('https://mail.example/', 1));
    closed.remember(tab('https://docs.example/', 2));
    closed.endGroup();

    const [newest, older] = closed.entries();
    expect(newest).toMatchObject({ kind: 'group', group: { name: 'Work' } });
    expect(newest?.kind === 'group' ? newest.tabs.map((entry) => entry.url) : []).toEqual([
      'https://mail.example/',
      'https://docs.example/',
    ]);
    expect(older).toMatchObject({ kind: 'tab', tab: { url: 'https://alone.example/' } });
  });

  it('leaves nothing behind for a group with no tab it could keep', () => {
    const closed = new ClosedTabs();
    closed.beginGroup({ name: 'Hush only', colour: 'plum', ownSession: false });
    closed.endGroup();
    expect(closed.canReopen).toBe(false);
  });

  it('takes one entry out of the middle of the list', () => {
    const closed = new ClosedTabs();
    ['https://a.example/', 'https://b.example/', 'https://c.example/'].forEach((url) => closed.remember(tab(url)));
    expect(closed.take(1)).toMatchObject({ kind: 'tab', tab: { url: 'https://b.example/' } });
    expect(closed.entries()).toHaveLength(2);
  });
});
