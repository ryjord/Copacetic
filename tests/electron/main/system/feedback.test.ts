import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getVersion: () => '2.2.0-beta.2' } }));

const { FEEDBACK_ADDRESS, feedbackFacts, feedbackMailto } = await import('../../../../electron/main/system/feedback');

/** What a mail app would put in each field, read back from the address it is handed. */
function opened(mailto: string) {
  const url = new URL(mailto);
  return { to: url.pathname, subject: url.searchParams.get('subject'), body: url.searchParams.get('body') ?? '' };
}

describe('sending feedback', () => {
  // An address, not the issue tracker, which stops being public when the source does.
  it('is an email to the feedback address, with a subject and room to write', () => {
    const email = opened(
      feedbackMailto({ version: '2.2.0', platform: 'darwin', systemVersion: '27.0', arch: 'arm64' }),
    );
    expect(email.to).toBe(FEEDBACK_ADDRESS);
    expect(email.to).toBe('contact@mrenigma.uk');
    expect(email.subject).toBe('Copacetic feedback');
    expect(email.body.startsWith('What happened, or what would you like changed?\n\n')).toBe(true);
  });

  it('says which copy it came from, in words a person reads before sending', () => {
    const email = opened(
      feedbackMailto({ version: '2.2.0', platform: 'win32', systemVersion: '10.0.26100', arch: 'x64' }),
    );
    expect(email.body).toContain('Copacetic 2.2.0');
    expect(email.body).toContain('Windows 10.0.26100 (x64)');
  });

  // A mail app reads + as a plus sign, so a sentence would arrive with its spaces turned into pluses.
  it('keeps its spaces as spaces', () => {
    const mailto = feedbackMailto({ version: '2.2.0', platform: 'linux', systemVersion: null, arch: 'arm64' });
    expect(mailto).not.toContain('+');
    expect(opened(mailto).body).toContain('Linux (arm64)');
  });

  it('reads this copy’s version and system', () => {
    expect(feedbackFacts()).toMatchObject({
      version: '2.2.0-beta.2',
      platform: process.platform,
      arch: process.arch,
    });
  });
});
