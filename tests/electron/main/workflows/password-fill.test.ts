import { describe, expect, it, vi } from 'vitest';

import type { Notice } from '../../../../electron/shared/chrome/notices';
import { PasswordFill } from '../../../../electron/main/workflows/password-fill';

type PasswordFillDeps = ConstructorParameters<typeof PasswordFill>[0];

function fillWith({
  url = 'https://example.com/login',
  urlAfterUnlock = undefined as string | undefined,
  password = 'secret' as string | null,
  pageAnswer = { filled: true },
  isOpen = true,
  unlockAnswer = '',
}) {
  const notices: Notice[] = [];
  let currentUrl = url;
  const unlock = vi.fn(async () => {
    currentUrl = urlAfterUnlock ?? url;
    return unlockAnswer;
  });
  const reveal = vi.fn(() => password);
  const executeJavaScript = vi.fn(async () => pageAnswer);
  const deps = {
    tabs: {
      urlFor: () => currentUrl,
      livePageFor: () => ({ executeJavaScript }),
    },
    vaultSession: {
      isOpen: () => isOpen,
      unlock,
      vault: {
        state: () => ({ entries: [{ id: 'entry-1', origin: 'https://example.com', username: 'riley' }] }),
        reveal,
      },
    },
    notices: { notify: (notice: Notice) => notices.push(notice) },
    // Only the parts filling reaches are faked.
  } as unknown as PasswordFillDeps;
  return { passwordFill: new PasswordFill(deps), notices, unlock, reveal, executeJavaScript };
}

describe('filling a password', () => {
  it('says nothing when it worked', async () => {
    const { passwordFill, notices } = fillWith({});
    expect(await passwordFill.fill('tab-1', 'entry-1')).toBe('');
    expect(notices).toEqual([]);
  });

  // The menu that started it has closed by the time the page answers, so the reason was lost.
  it.each([
    [{ pageAnswer: { filled: false } }, 'No password box was found on this page.'],
    [{ password: null }, 'The vault is locked, or that password cannot be decrypted on this machine.'],
    [{ url: 'https://elsewhere.example.org/' }, 'Nothing saved for this site.'],
  ])('says why when it could not fill', async (setup, reason) => {
    const { passwordFill, notices } = fillWith(setup);
    expect(await passwordFill.fill('tab-1', 'entry-1')).toBe(reason);
    expect(notices).toEqual([expect.objectContaining({ key: 'fill-password', message: reason })]);
  });
});

describe('filling while the vault is locked', () => {
  it('asks to unlock there and then, and fills once it is open', async () => {
    const { passwordFill, unlock, executeJavaScript } = fillWith({ isOpen: false });
    expect(await passwordFill.fill('tab-1', 'entry-1')).toBe('');
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(executeJavaScript).toHaveBeenCalledTimes(1);
  });

  it('does not ask when it is already open', async () => {
    const { passwordFill, unlock } = fillWith({ isOpen: true });
    await passwordFill.fill('tab-1', 'entry-1');
    expect(unlock).not.toHaveBeenCalled();
  });

  it('fills nothing when the prompt is refused, and says so', async () => {
    const { passwordFill, notices, reveal, executeJavaScript } = fillWith({
      isOpen: false,
      unlockAnswer: 'Not unlocked.',
    });
    expect(await passwordFill.fill('tab-1', 'entry-1')).toBe('Not unlocked.');
    expect(reveal).not.toHaveBeenCalled();
    expect(executeJavaScript).not.toHaveBeenCalled();
    expect(notices).toEqual([expect.objectContaining({ message: 'Not unlocked.' })]);
  });

  // The prompt can be up for seconds; a password must not land on wherever the tab went meanwhile.
  it('fills nothing when the page moved to another site while the prompt was up', async () => {
    const { passwordFill, reveal, executeJavaScript } = fillWith({
      isOpen: false,
      urlAfterUnlock: 'https://elsewhere.example.org/',
    });
    expect(await passwordFill.fill('tab-1', 'entry-1')).toBe('Nothing saved for this site.');
    expect(reveal).not.toHaveBeenCalled();
    expect(executeJavaScript).not.toHaveBeenCalled();
  });

  it('does not ask to unlock for a page the password does not belong to', async () => {
    const { passwordFill, unlock } = fillWith({ isOpen: false, url: 'https://elsewhere.example.org/' });
    expect(await passwordFill.fill('tab-1', 'entry-1')).toBe('Nothing saved for this site.');
    expect(unlock).not.toHaveBeenCalled();
  });
});
