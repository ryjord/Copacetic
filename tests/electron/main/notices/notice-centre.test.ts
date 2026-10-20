import { describe, expect, it, vi } from 'vitest';

import { NoticeCentre } from '../../../../electron/main/notices/notice-centre';
import type { Notice } from '../../../../electron/shared/chrome/notices';
import type { OverlayLayer } from '../../../../electron/main/window/overlay';

function centre() {
  const sent: unknown[][] = [];
  const overlay: Pick<OverlayLayer, 'send' | 'takeFocus'> = {
    send: (...args: unknown[]) => {
      sent.push(args);
    },
    takeFocus: () => {},
  };
  // Only the two methods the centre calls are needed.
  const notices = new NoticeCentre({ overlay: overlay as OverlayLayer });
  return { notices, sent };
}

function undo(id: string): Notice {
  return { id, key: id, tone: 'undo', message: id, confirm: 'Undo' };
}

describe('NoticeCentre', () => {
  it('withdraws every Undo still showing, without putting anything back', () => {
    const { notices, sent } = centre();
    const restore = vi.fn();
    notices.notify(undo('first'), restore);
    notices.notify({ id: 'said', key: 'said', tone: 'done', message: 'Done' });
    notices.withdrawUndos();
    notices.answer('first', true);
    expect(restore).not.toHaveBeenCalled();
    expect(notices.pending().map((notice) => notice.id)).toEqual(['said']);
    expect(sent).toContainEqual(['push:notice-settled', 'first']);
  });

  it('forgets an Undo whose notice was pushed out by newer ones', () => {
    const { notices } = centre();
    const restore = vi.fn();
    notices.notify(undo('oldest'), restore);
    ['second', 'third', 'fourth'].forEach((id) => notices.notify(undo(id), () => {}));
    notices.answer('oldest', true);
    expect(restore).not.toHaveBeenCalled();
  });

  it('keeps two Undos that read the same', () => {
    const { notices } = centre();
    const first = vi.fn();
    notices.notify({ ...undo('one'), message: 'Removed News' }, first);
    notices.notify({ ...undo('two'), message: 'Removed News' }, () => {});
    notices.answer('one', true);
    expect(first).toHaveBeenCalledOnce();
  });
});
