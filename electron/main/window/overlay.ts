import { WebContentsView, type BaseWindow, type WebContents, type WebFrameMain } from 'electron';
import { guardChromeWebContents } from '../security/security';
import { focusContents } from '../system/launch-mode';
import { chromeEntryUrl, preloadPath } from '../app/env';
import type { ContentBounds } from '../tabs/tab-layout';
import type { OverlayRegion } from '../../shared/overlay-regions';

/**
 * The one layer in this window that can be drawn on top of a page.
 *
 * A WebContentsView paints above all of the chrome's HTML, so nothing rendered
 * in the chrome can float over the content - it is painted behind the page and
 * says nothing to anybody. The chrome's answer until now has been to put things
 * in flow and push the page down, which is honest but moves everything for
 * something that may last four seconds.
 *
 * A view is the only thing that can sit above another view, so this is one:
 * transparent, stacked after the tabs, and no larger than what it is showing.
 * There are two, one held to each top corner of the page, because one view
 * spanning both would swallow every click on the page between them. Each is
 * hidden outright when it has nothing to show, for the same reason.
 */
export class OverlayLayer {
  private readonly view: WebContentsView;
  private width = 0;
  private height = 0;
  private bounds: ContentBounds = { x: 0, y: 0, width: 0, height: 0 };
  private isDisposed = false;
  /** Set by a question, spent the moment the overlay is actually on screen. */
  private wantsFocus = false;

  constructor(
    private readonly window: BaseWindow,
    private readonly region: OverlayRegion,
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Stated rather than inherited, so this view's guarantees are readable
        // here and cannot drift from the chrome window's by default change.
        webSecurity: true,
        allowRunningInsecureContent: false,
        // Transparent so the page shows through everywhere the overlay is not
        // drawing. Without this it is a grey sheet over the whole content area.
        transparent: true,
      },
    });
    this.view.setBackgroundColor('#00000000');
    this.view.setVisible(false);

    // Guarded like the chrome window, and for a sharper reason: this view is
    // trusted by the IPC layer, which checks the frame rather than the URL. A
    // frame that navigated somewhere else would keep every privilege the whole
    // browser has - bookmarks, settings, the vault - so it is not allowed to.
    guardChromeWebContents(this.view.webContents);
    void this.view.webContents.loadURL(`${chromeEntryUrl()}overlay/?region=${region}`);
  }

  /**
   * Whether a frame asking for something is this overlay's own.
   *
   * The overlay is trusted chrome with the same preload, but it is a different
   * webContents, so the guard that only knows the chrome window would refuse
   * even its own request to be measured.
   */
  /** Whether these are this overlay's own contents, for routing what they ask to the window they belong to. */
  holds(contents: WebContents): boolean {
    return !this.isDisposed && contents === this.view.webContents;
  }

  ownsFrame(frame: WebFrameMain | null): boolean {
    if (this.isDisposed || this.view.webContents.isDestroyed()) {
      return false;
    }
    return frame === this.view.webContents.mainFrame;
  }

  /**
   * Says something to the overlay's own page.
   *
   * The overlay is a separate webContents, so anything pushed to the chrome
   * window reaches everything except this - which is the one renderer that
   * draws it.
   */
  send(channel: string, payload?: unknown): void {
    if (this.isDisposed || this.view.webContents.isDestroyed()) {
      return;
    }
    this.view.webContents.send(channel, payload);
  }

  /** Where the page is, so the overlay can sit at the top of it. */
  setContentBounds(bounds: ContentBounds): void {
    this.bounds = bounds;
    this.apply();
  }

  /**
   * Puts the keyboard into the overlay, for a notice that asked something.
   *
   * The overlay is a view of its own, so focus does not reach it by tabbing
   * from the chrome: a question with a button would be answerable by mouse and
   * by nothing else. Only for questions - taking focus away from a page to say
   * something informative would be worse than saying nothing.
   */
  takeFocus(): void {
    // Remembered rather than done. A question is announced before the overlay
    // has drawn it - the height that makes the view visible comes back from the
    // renderer afterwards - and focusing a view that is not visible yet does
    // nothing at all, silently.
    this.wantsFocus = true;
    this.apply();
  }

  /**
   * How large the overlay's own content is, measured by the overlay itself.
   *
   * The main process cannot know how many lines a message wraps to, and a
   * guessed size either clips the last row or leaves a transparent band that
   * still eats clicks.
   */
  setSize(width: number, height: number): void {
    this.width = Math.max(0, Math.round(width));
    this.height = Math.max(0, Math.round(height));
    this.apply();
  }

  dispose(): void {
    this.isDisposed = true;
    // The window is already gone by the time `closed` fires, and touching a
    // destroyed window's contentView throws - which would abort the rest of
    // the browser's teardown, leaving tab views and prompts behind.
    if (!this.window.isDestroyed()) {
      this.window.contentView.removeChildView(this.view);
    }
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.close();
    }
  }

  private apply(): void {
    if (this.isDisposed || this.window.isDestroyed()) {
      return;
    }

    if (this.width === 0 || this.height === 0) {
      this.view.setVisible(false);
      return;
    }

    const width = Math.min(this.width, this.bounds.width);
    this.view.setBounds({
      // The content is laid out against the same corner, so moving the view never moves what it draws.
      x: this.region === 'leading' ? this.bounds.x : this.bounds.x + this.bounds.width - width,
      y: this.bounds.y,
      width,
      height: Math.min(this.height, this.bounds.height),
    });
    // Re-added rather than merely shown: a tab created since the last notice
    // was stacked on top of this, and a layer under the page is no layer.
    this.window.contentView.addChildView(this.view);
    this.view.setVisible(true);

    if (this.wantsFocus) {
      this.wantsFocus = false;
      focusContents(this.view.webContents);
    }
  }
}
