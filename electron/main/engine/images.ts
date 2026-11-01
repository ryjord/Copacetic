// Libs
import { type NativeImage, nativeImage } from 'electron';

/** A decoded image, resized and encoded without leaving the main process. */
export interface EngineImage extends Pick<NativeImage, 'getSize' | 'isEmpty' | 'toJPEG' | 'toPNG'> {
  crop(rect: { x: number; y: number; width: number; height: number }): EngineImage;
  resize(options: { width?: number; height?: number; quality?: 'good' | 'better' | 'best' }): EngineImage;
}

export function imageFromPath(path: string): EngineImage {
  return nativeImage.createFromPath(path);
}

export function imageFromDataUrl(dataUrl: string): EngineImage {
  return nativeImage.createFromDataURL(dataUrl);
}
