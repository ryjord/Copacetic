import { describe, expect, it } from 'vitest';
import {
  MOST_AT_ONCE,
  admit,
  dismiss,
  dismissAfterMs,
  importedMessage,
  openFolderMessage,
  savedGroupMessage,
  type Notice,
} from '../../electron/shared/notices';

const notice = (id: string, over: Partial<Notice> = {}): Notice => ({
  id,
  tone: 'info',
  message: id,
  key: id,
  ...over,
});

describe('how long a notice stays', () => {
  it('goes on its own when it is only telling you something', () => {
    expect(dismissAfterMs('info')).toBeGreaterThan(0);
    expect(dismissAfterMs('done')).toBeGreaterThan(0);
  });

  /*
   * A question that withdraws itself is a decision made by timing out, which is
   * not a decision anyone made.
   */
  it('never goes on its own when it asked something', () => {
    expect(dismissAfterMs('ask')).toBeNull();
  });
});

describe('adding a notice to what is already showing', () => {
  it('shows it', () => {
    expect(admit([], notice('a'))).toHaveLength(1);
  });

  it('replaces an earlier one about the same thing rather than stacking', () => {
    const first = notice('a', { key: 'import', message: '4 bookmarks' });
    const second = notice('b', { key: 'import', message: '12 bookmarks' });
    expect(admit([first], second).map((entry) => entry.message)).toEqual(['12 bookmarks']);
  });

  it('keeps notices about different things', () => {
    expect(admit([notice('a', { key: 'one' })], notice('b', { key: 'two' }))).toHaveLength(2);
  });

  it('drops the oldest once there are too many', () => {
    const showing = [notice('a'), notice('b'), notice('c')];
    const next = admit(showing, notice('d'));
    expect(next).toHaveLength(MOST_AT_ONCE);
    expect(next.map((entry) => entry.id)).toEqual(['b', 'c', 'd']);
  });

  /*
   * A question is waiting on a person. Dropping it to make room answers it by
   * discarding it, which is the one outcome nobody chose.
   */
  it('drops something informative before it drops a question', () => {
    const showing = [notice('question', { tone: 'ask' }), notice('b'), notice('c')];
    const next = admit(showing, notice('d'));
    expect(next.map((entry) => entry.id)).toEqual(['question', 'c', 'd']);
  });

  it('goes over the cap rather than dropping a question when they are all questions', () => {
    const showing = [notice('q1', { tone: 'ask' }), notice('q2', { tone: 'ask' }), notice('q3', { tone: 'ask' })];
    const next = admit(showing, notice('q4', { tone: 'ask' }));
    expect(next).toHaveLength(4);
  });
});

describe('removing one', () => {
  it('takes only the one named', () => {
    expect(dismiss([notice('a'), notice('b')], 'a').map((entry) => entry.id)).toEqual(['b']);
  });

  it('does nothing for one that has already gone', () => {
    expect(dismiss([notice('a')], 'gone')).toHaveLength(1);
  });
});

/**
 * The Hush count is the reason notices exist at all. A Hush tab is not saved,
 * and finding that out by counting the folder afterwards is finding it out too
 * late — the promise is only kept if it is also stated.
 */
describe('what is said about a group saved as a folder', () => {
  it('says nothing about Hush when no Hush tab was there', () => {
    const message = savedGroupMessage(6, 0, 'Dissertation');
    expect(message).toContain('6 pages');
    expect(message).not.toContain('Hush');
  });

  it('says how many Hush tabs were left out, and why', () => {
    const message = savedGroupMessage(6, 2, 'Dissertation');
    expect(message).toContain('2 Hush tabs were left out');
    expect(message).toContain('disk');
  });

  it('counts one of them properly', () => {
    expect(savedGroupMessage(1, 1, 'Work')).toContain('1 page');
    expect(savedGroupMessage(1, 1, 'Work')).toContain('1 Hush tab was');
  });
});

describe('what is said about an import', () => {
  it('says the number added', () => {
    expect(importedMessage(12, 0)).toBe('Added 12 bookmarks.');
  });

  // A short number after importing a big file reads as a failure unless the
  // arithmetic is shown.
  it('explains a short number rather than leaving it to look like one', () => {
    expect(importedMessage(12, 4)).toContain('4 were already saved');
  });

  it('counts one of them properly', () => {
    expect(importedMessage(1, 1)).toBe('Added 1 bookmark. 1 was already saved.');
  });
});

describe('what is asked before opening a folder', () => {
  it('names the number and the folder', () => {
    const message = openFolderMessage(214, 'Reading');
    expect(message).toContain('214');
    expect(message).toContain('Reading');
  });
});
