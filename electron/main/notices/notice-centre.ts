import { PUSH } from '../../shared/ipc/channels';
import { type Notice, admit, dismiss as dismissNotice } from '../../shared/chrome/notices';
import type { OverlayLayer } from '../window/overlay';

/** What the browser tells the person, and the questions it waits on. */
export class NoticeCentre {
  constructor(private readonly deps: { overlay: OverlayLayer }) {}

  /** Questions waiting on an answer, by the id the notice carries. */
  private readonly pendingAnswers = new Map<string, () => void>();
  /** What a no does, for the few questions where turning it down is itself a choice to remember. */
  private readonly pendingRefusals = new Map<string, () => void>();
  /**
   * Notices that have been said but not yet taken.
   *
   * The chrome is a page, and a page is listening some time after the window
   * paints - about 190ms on the machine in the README, and the whole launch is
   * slower than that again on a cold start. Anything said before then reached
   * nobody: a notice pushed during startup was simply lost, which is the whole
   * failure notices exist to fix. They are kept here until the chrome collects
   * them.
   */
  private outstanding: Notice[] = [];
  /**
   * Tells the person something, once.
   *
   * The main process is where most things finish - a menu click, an import, a
   * list update - and until now none of them could say so: each ended at a
   * count that nothing read.
   */
  notify(notice: Notice, onConfirm?: () => void, onRefuse?: () => void): void {
    const next = admit(this.outstanding, notice);
    // Replaced or pushed out, a notice can no longer be answered, so what it was holding goes with it.
    this.outstanding.filter((shown) => !next.includes(shown)).forEach((dropped) => this.forgetAnswers(dropped.id));
    this.outstanding = next;
    if (onConfirm && next.includes(notice)) {
      this.pendingAnswers.set(notice.id, onConfirm);
    }
    if (onRefuse && next.includes(notice)) {
      this.pendingRefusals.set(notice.id, onRefuse);
    }
    // A question is answered with a button, and the overlay is a view of its
    // own: without this the keyboard cannot reach it at all. An offer nobody
    // asked for leaves the keyboard where it was.
    if (notice.tone === 'ask' && !notice.isOffer) {
      this.deps.overlay.takeFocus();
    }
    // Said to the overlay, which is the renderer that draws notices. Pushing
    // to the chrome window reaches every renderer except that one.
    this.deps.overlay.send(PUSH.notice, notice);
  }

  /** What was said before anyone was listening, asked for as the chrome starts. */
  pending(): Notice[] {
    return this.outstanding;
  }

  /** Takes back every Undo still showing, once something was forgotten or cleared that one of them would restore. */
  withdrawUndos(): void {
    const undos = this.outstanding.filter((notice) => notice.tone === 'undo');
    undos.forEach((notice) => this.answer(notice.id, false));
  }

  /** Answers a question a notice asked. Anything but a yes simply drops it. */
  answer(id: string, confirmed: boolean): void {
    const act = this.pendingAnswers.get(id);
    const refuse = this.pendingRefusals.get(id);
    this.forgetAnswers(id);
    this.outstanding = dismissNotice(this.outstanding, id);
    // The overlay draws notices and keeps its own copy, so an answer given
    // anywhere else - the API, another window - would leave it on screen with
    // nothing behind it. It has to be told the question is settled.
    this.deps.overlay.send(PUSH.noticeSettled, id);
    if (confirmed) {
      act?.();
    } else {
      refuse?.();
    }
  }

  /** Takes a notice back because it no longer applies, which answers nothing either way. */
  withdraw(id: string): void {
    if (!this.outstanding.some((notice) => notice.id === id)) {
      return;
    }
    this.forgetAnswers(id);
    this.outstanding = dismissNotice(this.outstanding, id);
    this.deps.overlay.send(PUSH.noticeSettled, id);
  }

  private forgetAnswers(id: string): void {
    this.pendingAnswers.delete(id);
    this.pendingRefusals.delete(id);
  }
}
