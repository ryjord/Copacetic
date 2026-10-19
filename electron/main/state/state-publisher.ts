import type { BrowserState } from '../../shared/types';
import { type BrowserStatePatch, changedSlices } from '../../shared/ipc/state-slices';

interface StatePublisherDeps {
  snapshot: () => BrowserState;
  send: (patch: BrowserStatePatch) => void;
  /** Whether there is a renderer to send to at all. */
  canSend: () => boolean;
  /** Run once per push, before it goes, for anything that should follow the state (the session file). */
  beforeSend: () => void;
}

/** About thirty pushes a second at most. A download reports progress far faster than anyone reads it. */
export const MIN_PUSH_INTERVAL_MS = 33;

/**
 * Tells the chrome what changed, coalesced and capped.
 *
 * `setImmediate` alone coalesced only what happened in one tick, so a download
 * or a page firing events across ticks pushed at the rate it fired.
 */
export class StatePublisher {
  private sent = new Map<keyof BrowserState, string>();
  private isQueued = false;
  private lastPushAt = 0;
  private isStopped = false;

  constructor(
    private readonly deps: StatePublisherDeps,
    private readonly now: () => number = Date.now,
  ) {}

  schedule(): void {
    if (this.isQueued || this.isStopped) {
      return;
    }
    this.isQueued = true;
    const wait = Math.max(0, this.lastPushAt + MIN_PUSH_INTERVAL_MS - this.now());
    if (wait === 0) {
      setImmediate(() => this.flush());
    } else {
      setTimeout(() => this.flush(), wait).unref?.();
    }
  }

  /** A new renderer knows nothing, so the next push carries everything. */
  forgetWhatWasSent(): void {
    this.sent = new Map();
  }

  stop(): void {
    this.isStopped = true;
  }

  private flush(): void {
    this.isQueued = false;
    if (this.isStopped || !this.deps.canSend()) {
      return;
    }
    this.lastPushAt = this.now();
    this.deps.beforeSend();
    const { patch, sent } = changedSlices(this.sent, this.deps.snapshot());
    this.sent = sent;
    if (Object.keys(patch).length > 0) {
      this.deps.send(patch);
    }
  }
}
