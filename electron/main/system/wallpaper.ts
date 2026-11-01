// Libs
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Utils
import { dialog } from '../engine/dialogs';
import { imageFromPath } from '../engine/images';
import { t } from '../../shared/i18n/translate';

// Types
import type { EngineWindow } from '../engine/windows';

/** Wide enough for any display this will run on, small enough to stay sane. */
const MAX_WIDTH = 2560;
/** Visibly lossless at wallpaper scale, and a fraction of a PNG. */
const JPEG_QUALITY = 82;
/** Wide enough to judge a picture by, small enough not to weigh Settings down. */
const PREVIEW_WIDTH = 480;

/** A picture behind the start page, one per profile, kept in the profile's folder. */
export class Wallpaper {
  /** Asked on every state push, so the disk is asked once and told when it changes. */
  private isWallpaperSet: boolean | null = null;
  /**
   * A wallpaper someone has picked but not yet kept.
   *
   * The rest of the appearance pane shows a change before it is saved, and a
   * wallpaper that wrote itself to disk the moment it was chosen was the one
   * thing on that pane that could not be taken back. It waits here instead, and
   * is written only when the rest of the draft is.
   */
  private staged: Buffer | null = null;
  /** A removal waits like a choice does, so that Discard can undo it. */
  private isRemovalStaged = false;

  constructor(private readonly directory: string) {}

  private get file(): string {
    return path.join(this.directory, 'wallpaper.jpg');
  }

  isSet(): boolean {
    this.isWallpaperSet ??= existsSync(this.file);
    return this.isWallpaperSet;
  }

  /** Read back as a data URL because the chrome's CSP is `img-src 'self' data:` - it cannot load a file from disk, and widening that for a decoration would be a poor trade. */
  read(): string | null {
    if (!existsSync(this.file)) {
      return null;
    }
    try {
      return `data:image/jpeg;base64,${readFileSync(this.file).toString('base64')}`;
    } catch {
      return null;
    }
  }

  /** A small version, for showing what is set without loading the whole thing. */
  readPreview(): string | null {
    if (!existsSync(this.file)) {
      return null;
    }
    try {
      const image = imageFromPath(this.file);
      if (image.isEmpty()) {
        return null;
      }
      const preview = image.getSize().width > PREVIEW_WIDTH ? image.resize({ width: PREVIEW_WIDTH }) : image;
      return `data:image/jpeg;base64,${preview.toJPEG(75).toString('base64')}`;
    } catch {
      return null;
    }
  }

  stagedImage(): string | null {
    return this.staged ? `data:image/jpeg;base64,${this.staged.toString('base64')}` : null;
  }

  discardStaged(): void {
    this.staged = null;
    this.isRemovalStaged = false;
  }

  /**
   * Writes what was staged. Nothing staged means nothing to do, not an error.
   *
   * Returns what to say when it could not be written. The image stays staged in
   * that case: reporting the draft as kept and dropping the picture is the worst
   * of the available outcomes.
   */
  commitStaged(): string {
    if (!this.staged) {
      return '';
    }
    try {
      writeFileSync(this.file, this.staged);
    } catch (error) {
      return error instanceof Error ? error.message : t('main.wallpaper.saveFailed');
    } finally {
      this.isWallpaperSet = null;
    }
    this.staged = null;
    return '';
  }

  /** Everything the pane staged, applied together. */
  commitStagedChanges(): string {
    if (this.isRemovalStaged) {
      this.clear();
      return '';
    }
    return this.commitStaged();
  }

  /** Asks for an image and stages a copy. */
  async choose(window: EngineWindow): Promise<string> {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: t('main.wallpaper.chooseTitle'),
      properties: ['openFile'],
      filters: [{ name: t('main.wallpaper.filterName'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
    });

    const source = filePaths[0];
    if (canceled || !source) {
      return '';
    }

    try {
      let image = imageFromPath(source);
      if (image.isEmpty()) {
        return t('main.wallpaper.notAnImage');
      }

      const { width } = image.getSize();
      if (width > MAX_WIDTH) {
        image = image.resize({ width: MAX_WIDTH, quality: 'good' });
      }

      const encoded = image.toJPEG(JPEG_QUALITY);
      if (encoded.length === 0) {
        return t('main.wallpaper.notConverted');
      }

      this.staged = encoded;
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : t('main.wallpaper.saveFailed');
    }
  }

  isRemovalWaiting(): boolean {
    return this.isRemovalStaged;
  }

  stageRemoval(): void {
    this.staged = null;
    this.isRemovalStaged = true;
  }

  clear(): void {
    this.staged = null;
    this.isRemovalStaged = false;
    try {
      rmSync(this.file, { force: true });
    } catch {
      // Already gone is the outcome we wanted.
    }
    this.isWallpaperSet = null;
  }
}
