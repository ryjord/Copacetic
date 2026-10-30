// Types
import type { WebContents } from 'electron';

// A world of its own, apart from the page's (0), Electron's preload world (999) and the sign-in watch (1031).
const PICTURE_IN_PICTURE_WORLD = 1032;

const OUTCOMES = ['entered', 'left', 'none', 'refused'] as const;
export type PictureInPictureOutcome = (typeof OUTCOMES)[number];

/**
 * Puts a video into picture in picture, or brings one back that already is.
 * The video at the point asked about when there is one, otherwise the largest
 * on the page that can go. Run once, when chosen, and it reads nothing but
 * which video is where.
 */
export function pictureInPictureScript(point: { x: number; y: number } | null): string {
  const atPoint = point ? `document.elementsFromPoint(${Math.round(point.x)}, ${Math.round(point.y)})` : '[]';
  return `(async () => {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture();
    return 'left';
  }
  const canGo = (video) => !video.disablePictureInPicture && video.readyState > 0;
  const area = (video) => video.clientWidth * video.clientHeight;
  const pointed = ${atPoint}.find((element) => element instanceof HTMLVideoElement && canGo(element));
  const largest = Array.from(document.querySelectorAll('video'))
    .filter(canGo)
    .sort((aVideo, bVideo) => area(bVideo) - area(aVideo))[0];
  const video = pointed ?? largest;
  if (!video) {
    return 'none';
  }
  try {
    await video.requestPictureInPicture();
    return 'entered';
  } catch {
    return 'refused';
  }
})()`;
}

/** Asks the page in a tab to put a video into picture in picture, or bring it back, and says what happened. */
export async function togglePictureInPicture(
  contents: WebContents | null,
  point: { x: number; y: number } | null,
): Promise<PictureInPictureOutcome> {
  if (!contents) {
    return 'none';
  }
  try {
    // A gesture, because a page may only enter picture in picture when someone asked for it.
    const outcome: unknown = await contents.executeJavaScriptInIsolatedWorld(
      PICTURE_IN_PICTURE_WORLD,
      [{ code: pictureInPictureScript(point) }],
      true,
    );
    return OUTCOMES.find((known) => known === outcome) ?? 'none';
  } catch {
    return 'refused';
  }
}
