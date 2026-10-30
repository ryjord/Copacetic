// Libs
import { app } from 'electron';

// Utils
import { t } from '../../shared/i18n/translate';

// An address rather than the issue tracker, which stops being public when the source does.
export const FEEDBACK_ADDRESS = 'contact@mrenigma.uk';

const PLATFORM_NAMES: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

/** What the email says about this copy, all of it in front of the person before they choose to send it. */
export interface FeedbackFacts {
  version: string;
  platform: string;
  systemVersion: string | null;
  arch: string;
}

/**
 * A pre-filled email, as a mailto: address for the system's mail app to open.
 * Nothing leaves the machine until the person presses send there, and they can
 * read and change every line first.
 */
export function feedbackMailto(facts: FeedbackFacts): string {
  const system = [PLATFORM_NAMES[facts.platform] ?? facts.platform, facts.systemVersion].filter(Boolean).join(' ');
  const body = [
    t('main.feedback.prompt'),
    '',
    '',
    '---',
    `Copacetic ${facts.version}`,
    `${system} (${facts.arch})`,
  ].join('\n');
  const query = new URLSearchParams({ subject: t('main.feedback.subject'), body });
  // A mail app reads + as a plus sign, not a space, so spaces go as %20.
  return `mailto:${FEEDBACK_ADDRESS}?${query.toString().replaceAll('+', '%20')}`;
}

/** This copy's own version and system, read when the email is made. */
export function feedbackFacts(): FeedbackFacts {
  return {
    version: app.getVersion(),
    platform: process.platform,
    // Electron's own addition to process, absent when this runs under plain Node in a test.
    systemVersion: typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : null,
    arch: process.arch,
  };
}
