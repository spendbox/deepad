'use client';

// Background removal for celebrant photos, done on the planner's own phone or
// computer (free, private: the photo never goes to another company).
// Uses Google's MediaPipe "selfie multiclass" model, which finds people,
// including their hair and clothes. The model (~16 MB) downloads the first
// time and is then cached by the browser.

import type { ImageSegmenter } from '@mediapipe/tasks-vision';

const VERSION = '1.0.1';
const WASM_BASE = process.env.NEXT_PUBLIC_MEDIAPIPE_WASM ?? `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL =
  process.env.NEXT_PUBLIC_CUTOUT_MODEL ??
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

let segmenter: Promise<ImageSegmenter> | null = null;

function load(): Promise<ImageSegmenter> {
  segmenter ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const make = (delegate: 'GPU' | 'CPU') =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    // The graphics chip is faster; not every phone allows it.
    return make('GPU').catch(() => make('CPU'));
  })();
  segmenter.catch(() => {
    segmenter = null; // try again next time (e.g. after the internet comes back)
  });
  return segmenter;
}

/** Start downloading the model early (e.g. when the photo step opens). */
export function preloadCutout() {
  load().catch(() => {});
}

export type CutoutResult = { blob: Blob; type: string } | { error: 'no-person' | 'failed' };

/**
 * Remove the background from a photo. The result is cropped around the
 * person, with a transparent background (WebP, or PNG where WebP isn't supported).
 */
export async function removeBackground(source: ImageBitmap, maxSide = 1400): Promise<CutoutResult> {
  try {
    const seg = await load();
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const w = Math.round(source.width * scale);
    const h = Math.round(source.height * scale);
    const photo = document.createElement('canvas');
    photo.width = w;
    photo.height = h;
    photo.getContext('2d')!.drawImage(source, 0, 0, w, h);

    const result = seg.segment(photo);
    // Mask 0 is "background": how sure the model is, per pixel, from 0 to 1.
    const bgMask = result.confidenceMasks?.[0];
    if (!bgMask) return { error: 'failed' };
    const mw = bgMask.width;
    const mh = bgMask.height;
    const bg = bgMask.getAsFloat32Array();
    result.close();

    // Turn "how sure it's background" into see-through-ness, with crisp but soft edges.
    const alpha = new ImageData(mw, mh);
    let person = 0;
    let minX = mw, minY = mh, maxX = -1, maxY = -1;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const i = y * mw + x;
        const p = 1 - bg[i];
        const t = Math.min(1, Math.max(0, (p - 0.25) / 0.5));
        const a = t * t * (3 - 2 * t); // smoothstep
        alpha.data[i * 4 + 3] = Math.round(a * 255);
        if (a > 0.5) {
          person++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (person < mw * mh * 0.03) return { error: 'no-person' };

    // Stretch the mask to the photo's size (smoothly), then keep only the person.
    const maskSmall = document.createElement('canvas');
    maskSmall.width = mw;
    maskSmall.height = mh;
    maskSmall.getContext('2d')!.putImageData(alpha, 0, 0);
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(photo, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(maskSmall, 0, 0, w, h);

    // Crop around the person with a little space, so they fill the frame on screen.
    const sx = w / mw;
    const sy = h / mh;
    const pad = Math.round(Math.max(w, h) * 0.03);
    const cx = Math.max(0, Math.floor(minX * sx) - pad);
    const cy = Math.max(0, Math.floor(minY * sy) - pad);
    const cw = Math.min(w, Math.ceil((maxX + 1) * sx) + pad) - cx;
    const ch = Math.min(h, Math.ceil((maxY + 1) * sy) + pad) - cy;
    const crop = document.createElement('canvas');
    crop.width = cw;
    crop.height = ch;
    crop.getContext('2d')!.drawImage(out, cx, cy, cw, ch, 0, 0, cw, ch);

    const toBlob = (type: string, q?: number) => new Promise<Blob | null>((r) => crop.toBlob(r, type, q));
    let blob = await toBlob('image/webp', 0.9);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/png');
    if (!blob) return { error: 'failed' };
    return { blob, type: blob.type };
  } catch (err) {
    console.error('Background removal failed', err);
    return { error: 'failed' };
  }
}

/** Photos whose background was removed have "-cutout" in their file name. */
export function isCutout(url: string): boolean {
  return /-cutout\.(png|webp)(\?|;|$)/.test(url);
}
