import { describe, expect, it } from 'vitest';

import type { Notice } from '../../../../electron/shared/notices';
import { PasswordFill } from '../../../../electron/main/workflows/password-fill';

type PasswordFillDeps = ConstructorParameters<typeof PasswordFill>[0];

function fillWith({
  url = 'https://example.com/login',
  password = 'secret' as string | null,
  pageAnswer = { filled: true },
}) {
  const notices: Notice[] = [];
  const deps = {
    tabs: {
      urlFor: () => url,
      contentsForTab: () => ({ executeJavaScript: async () => pageAnswer }),
    },
    vaultSession: {
      vault: {
        state: () => ({ entries: [{ id: 'entry-1', origin: 'https://example.com', username: 'riley' }] }),
        reveal: () => password,
      },
    },
    notices: { notify: (notice: Notice) => notices.push(notice) },
    // Only the parts filling reaches are faked.
  } as unknown as PasswordFillDeps;
  return { passwordFill: new PasswordFill(deps), notices };
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
