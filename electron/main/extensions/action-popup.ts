// Libs
import { type BrowserWindow, type Session, type WebContents, WebContentsView } from 'electron';

// Utils
import { log } from '../system/diagnostics';

// The smallest and largest Chrome lets an extension popup be.
const SMALLEST = { width: 25, height: 25 };
const LARGEST = { width: 800, height: 600 };
const FIRST_SIZE = { width: 360, height: 480 };

export interface PopupAnchor {
  /** The pressed button's edges, in the window's own coordinates. */
  left: number;
  right: number;
  bottom: number;
}

interface PopupOptions {
  window: BrowserWindow;
  session: Session;
  url: string;
  /** `chrome-extension://id/`: anything the popup navigates to outside it goes to a tab instead. */
  origin: string;
  anchor: PopupAnchor;
  preload: string;
  /** Called once the page exists, to give it the extension API. */
  onContents: (contents: WebContents) => void;
  /** A link the popup opens goes to a tab; a popup never becomes a window. */
  openInTab: (url: string) => void;
}

/**
 * An extension's toolbar popup: a page of its own over the top of the window,
 * under the button that opened it, as large as it asks to be within Chrome's
 * limits. One at a time; anything that takes focus away closes it.
 */
export class ActionPopup {
  private view: WebContentsView | null = null;
  private window: BrowserWindow | null = null;
  private readonly closeOnResize = () => this.close('the window was resized');
  private readonly closeOnLeaving = () => this.close('the window was left');
  // A press in the browser's own interface; focus moving there on its own, as an extension asking for its window does, is not one.
  private readonly closeOnPress = (_event: Electron.Event, input: Electron.InputEvent) => {
    if (input.type === 'mouseDown') {
      this.close('the browser was pressed');
    }
  };

  get isOpen(): boolean {
    return this.view !== null;
  }

  open(options: PopupOptions): void {
    this.close('another popup opened');
    const view = new WebContentsView({
      webPreferences: {
        session: options.session,
        preload: options.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        enablePreferredSizeMode: true,
      },
    });
    this.view = view;
    this.window = options.window;
    const contents = view.webContents;
    options.onContents(contents);

    const place = (size: { width: number; height: number }) => {
      const [windowWidth = 0, windowHeight = 0] = options.window.getContentSize();
      const width = Math.min(Math.max(size.width, SMALLEST.width), LARGEST.width, windowWidth);
      const height = Math.min(
        Math.max(size.height, SMALLEST.height),
        LARGEST.height,
        windowHeight - options.anchor.bottom,
      );
      // Its right edge under the button's, kept on screen.
      const x = Math.max(0, Math.min(options.anchor.right - width, windowWidth - width));
      view.setBounds({ x, y: options.anchor.bottom, width, height });
    };
    place(FIRST_SIZE);
    contents.on('preferred-size-changed', (_event, size) => place(size));
    contents.setWindowOpenHandler(({ url }) => {
      options.openInTab(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith(options.origin)) {
        event.preventDefault();
        options.openInTab(url);
      }
    });
    contents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        this.close('Escape');
      }
    });
    // As in Chrome: it goes when the window is left or resized, or something else in it is pressed; a click into
    // the page is reported by the window's owner. Not on its own blur, which a window behind others sends before
    // the popup has ever been used.
    options.window.on('resize', this.closeOnResize);
    // Only a window that was in front can be left; one behind others blurs as the popup takes focus.
    if (options.window.isFocused()) {
      options.window.on('blur', this.closeOnLeaving);
    }
    options.window.webContents.on('input-event', this.closeOnPress);

    // Added last, so it paints over the page and every other view the window holds.
    options.window.contentView.addChildView(view);
    void contents.loadURL(options.url).then(() => {
      if (this.view === view) {
        contents.focus();
      }
    });
  }

  close(reason: string): void {
    const { view, window } = this;
    this.view = null;
    this.window = null;
    if (!view) {
      return;
    }
    log.info('an extension popup closed', { reason });
    window?.off('resize', this.closeOnResize);
    window?.off('blur', this.closeOnLeaving);
    if (window && !window.isDestroyed()) {
      window.webContents.off('input-event', this.closeOnPress);
    }
    if (window && !window.isDestroyed()) {
      window.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  }
}
