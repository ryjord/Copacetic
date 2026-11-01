import { describe, expect, it } from 'vitest';
import { appIdFromArguments, appIdFromLink, appLinkFor } from '../../../../electron/shared/data/installed-apps';

describe('the ways a shortcut names its app', () => {
  it('reads the id back from the link a macOS launcher opens', () => {
    expect(appIdFromLink(appLinkFor('Ab-9_x'))).toBe('Ab-9_x');
  });

  it('reads --app=<id> from a Windows or Linux shortcut, among other arguments', () => {
    expect(appIdFromArguments(['/opt/Copacetic/copacetic', '--no-sandbox', '--app=Ab-9_x'])).toBe('Ab-9_x');
    expect(appIdFromArguments(['/opt/Copacetic/copacetic', 'https://example.com/'])).toBeNull();
  });

  // The id ends up in a path and a script, so anything but its own characters is refused.
  it('refuses an id that is not one', () => {
    expect(appIdFromLink('copacetic-app://open/../../etc')).toBeNull();
    expect(appIdFromLink("copacetic-app://open/a'b")).toBeNull();
    expect(appIdFromArguments(['copacetic', '--app=a b'])).toBeNull();
    expect(appIdFromLink('https://example.com/')).toBeNull();
  });
});
