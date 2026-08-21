import type { AuthPrompt, PermissionDecision, PermissionPrompt, TabId } from '../../shared/types';

interface PendingAuth {
  prompt: AuthPrompt;
  respond: (username?: string, password?: string) => void;
}

interface PendingPermission {
  prompt: PermissionPrompt;
  resolve: (decision: PermissionDecision) => void;
}

/**
 * The questions waiting on a person. Each one holds something suspended — a
 * page's permission promise, or a challenge Chromium has stopped a request for
 * — so every one has to be settled exactly once, including when nobody ever
 * answers it because the tab that asked has gone.
 */
export class PendingPrompts {
  private readonly permissions = new Map<string, PendingPermission>();
  private readonly auth = new Map<string, PendingAuth>();

  addPermission(prompt: PermissionPrompt, resolve: (decision: PermissionDecision) => void): void {
    this.permissions.set(prompt.id, { prompt, resolve });
  }

  addAuth(prompt: AuthPrompt, respond: (username?: string, password?: string) => void): void {
    this.auth.set(prompt.id, { prompt, respond });
  }

  /** Called by the challenge's own responder, which settles it before it gets here. */
  forgetAuth(id: string): void {
    this.auth.delete(id);
  }

  permissionPrompts(): PermissionPrompt[] {
    return [...this.permissions.values()].map((pending) => pending.prompt);
  }

  authPrompts(): AuthPrompt[] {
    return [...this.auth.values()].map((pending) => pending.prompt);
  }

  /** The settled prompt, so the caller can decide whether to remember the answer. */
  resolvePermission(id: string, decision: PermissionDecision): PermissionPrompt | null {
    const pending = this.permissions.get(id);
    if (!pending) {
      return null;
    }
    this.permissions.delete(id);
    pending.resolve(decision);
    return pending.prompt;
  }

  respondToAuth(id: string, username: string, password: string): void {
    this.auth.get(id)?.respond(username, password);
  }

  cancelAuth(id: string): void {
    this.auth.get(id)?.respond();
  }

  /**
   * Closing a tab is an answer. Without this a prompt outlives its tab twice
   * over: the page's promise never settles, and the chrome goes on drawing a
   * banner for a tab that is no longer there. Returns whether anything was
   * settled, so the caller only redraws when there is a reason to.
   */
  dropForTab(tabId: TabId): boolean {
    let dropped = false;
    for (const [id, pending] of this.permissions) {
      if (pending.prompt.tabId !== tabId) {
        continue;
      }
      this.permissions.delete(id);
      pending.resolve('deny');
      dropped = true;
    }

    // Responding removes the challenge from this map, which a Map iterator
    // tolerates: the entries after it are still visited.
    for (const [, pending] of this.auth) {
      if (pending.prompt.tabId !== tabId) {
        continue;
      }
      pending.respond();
      dropped = true;
    }

    return dropped;
  }

  /** Quitting is an answer too: refuse everything outstanding rather than leaving a page's promise hanging as the process goes away. */
  settleAll(): void {
    for (const pending of this.permissions.values()) {
      pending.resolve('deny');
    }
    this.permissions.clear();
    for (const pending of this.auth.values()) {
      pending.respond();
    }
    this.auth.clear();
  }
}
