import { describe, expect, it, vi } from 'vitest';
import { pictureInPictureScript, togglePictureInPicture } from '../../../../electron/main/tabs/picture-in-picture';

/** A stand-in for a page's video, with only what the script reads and calls. */
class FakeVideo {
  disablePictureInPicture = false;
  readyState = 4;
  requestPictureInPicture = vi.fn(async () => {});
  constructor(
    readonly clientWidth: number,
    readonly clientHeight: number,
  ) {}
}

/** Runs the script against a fake document, as the page would. */
function runIn(page: { videos: FakeVideo[]; atPoint?: unknown[]; inPictureInPicture?: boolean }, script: string) {
  const document = {
    pictureInPictureElement: page.inPictureInPicture ? page.videos[0] : null,
    exitPictureInPicture: vi.fn(async () => {}),
    elementsFromPoint: vi.fn(() => page.atPoint ?? []),
    querySelectorAll: () => page.videos,
  };
  const run = new Function('document', 'HTMLVideoElement', `return ${script}`) as (
    document: unknown,
    videoClass: unknown,
  ) => Promise<string>;
  return { outcome: run(document, FakeVideo), document };
}

describe('the picture in picture script', () => {
  it('puts the video that was right-clicked into picture in picture', async () => {
    const small = new FakeVideo(100, 100);
    const large = new FakeVideo(800, 450);
    const { outcome } = runIn({ videos: [small, large], atPoint: [small] }, pictureInPictureScript({ x: 10, y: 10 }));
    expect(await outcome).toBe('entered');
    expect(small.requestPictureInPicture).toHaveBeenCalled();
    expect(large.requestPictureInPicture).not.toHaveBeenCalled();
  });

  // From the menu bar there is no point to go by, and the video someone is watching is the big one.
  it('takes the largest video that can go when no point is named', async () => {
    const small = new FakeVideo(100, 100);
    const barred = Object.assign(new FakeVideo(1920, 1080), { disablePictureInPicture: true });
    const empty = Object.assign(new FakeVideo(1280, 720), { readyState: 0 });
    const large = new FakeVideo(800, 450);
    const { outcome } = runIn({ videos: [small, barred, empty, large] }, pictureInPictureScript(null));
    expect(await outcome).toBe('entered');
    expect(large.requestPictureInPicture).toHaveBeenCalled();
    expect(barred.requestPictureInPicture).not.toHaveBeenCalled();
  });

  it('brings a video back when one is already in picture in picture', async () => {
    const video = new FakeVideo(800, 450);
    const { outcome, document } = runIn({ videos: [video], inPictureInPicture: true }, pictureInPictureScript(null));
    expect(await outcome).toBe('left');
    expect(document.exitPictureInPicture).toHaveBeenCalled();
    expect(video.requestPictureInPicture).not.toHaveBeenCalled();
  });

  it('says so when there is no video, and when the page refuses', async () => {
    expect(await runIn({ videos: [] }, pictureInPictureScript(null)).outcome).toBe('none');
    const refusing = new FakeVideo(800, 450);
    refusing.requestPictureInPicture.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(await runIn({ videos: [refusing] }, pictureInPictureScript(null)).outcome).toBe('refused');
  });

  // The point comes from the main process, but it is written into code, so only whole numbers go in.
  it('writes the point into the script as whole numbers only', () => {
    expect(pictureInPictureScript({ x: 10.6, y: 2.4 })).toContain('document.elementsFromPoint(11, 2)');
  });
});

describe('asking a tab for picture in picture', () => {
  it('runs once, in a world of its own, as something the person asked for', async () => {
    const executeJavaScriptInIsolatedWorld = vi.fn(async () => 'entered');
    const contents = { executeJavaScriptInIsolatedWorld } as never;
    expect(await togglePictureInPicture(contents, { x: 5, y: 5 })).toBe('entered');
    expect(executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(1);
    expect(executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      1032,
      [expect.objectContaining({ code: expect.any(String) })],
      true,
    );
  });

  it('reports nothing to do for a tab with no page, and a refusal when the page throws', async () => {
    expect(await togglePictureInPicture(null, null)).toBe('none');
    const throwing = {
      executeJavaScriptInIsolatedWorld: vi.fn(async () => Promise.reject(new Error('gone'))),
    } as never;
    expect(await togglePictureInPicture(throwing, null)).toBe('refused');
    const strange = { executeJavaScriptInIsolatedWorld: vi.fn(async () => 'something else') } as never;
    expect(await togglePictureInPicture(strange, null)).toBe('none');
  });
});
