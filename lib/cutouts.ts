import 'server-only';
import sharp from 'sharp';

// Background removal for celebrant photos, done when a photo is uploaded.
//   FAPIHUB_API_KEY   → FAPIhub (fapihub.com): 100 free photos a month, then about $0.001 each.
//   PHOTOROOM_API_KEY → Photoroom (photoroom.com/api), used only if FAPIhub isn't set up.
// Whichever does the cut-out, we trim the empty edges and save a small WebP,
// so the big screen loads it quickly.

type Provider = 'fapihub' | 'photoroom';

function provider(): Provider | null {
  if (process.env.FAPIHUB_API_KEY) return 'fapihub';
  if (process.env.PHOTOROOM_API_KEY) return 'photoroom';
  return null;
}

export function cutoutsConfigured(): boolean {
  return provider() !== null;
}

/** For the admin Setup check. */
export function cutoutStatus(): { ok: boolean; detail: string } {
  const p = provider();
  if (p === 'fapihub') return { ok: true, detail: 'FAPIhub is set up (100 free photos a month, then about $0.001 each).' };
  if (p === 'photoroom') {
    return (process.env.PHOTOROOM_API_KEY ?? '').startsWith('sandbox_')
      ? { ok: false, detail: 'Photoroom SANDBOX key in use: cut-outs have a watermark. Add FAPIHUB_API_KEY instead (free tier).' }
      : { ok: true, detail: 'Photoroom is set up. FAPIhub is much cheaper: add FAPIHUB_API_KEY to switch.' };
  }
  return { ok: false, detail: 'Optional. Add FAPIHUB_API_KEY in Vercel (free at fapihub.com) so celebrant photos can be cut out.' };
}

async function callFapihub(photo: Blob): Promise<Uint8Array> {
  const form = new FormData();
  form.append('image', photo, 'photo.jpg');
  if (process.env.FAPIHUB_MODEL) form.append('model', process.env.FAPIHUB_MODEL);
  const res = await fetch(`${process.env.FAPIHUB_API_BASE || 'https://fapihub.com'}/v2/rembg/`, {
    method: 'POST',
    headers: { ApiKey: process.env.FAPIHUB_API_KEY! },
    body: form,
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) {
    throw new Error(`FAPIhub ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function callPhotoroom(photo: Blob): Promise<Uint8Array> {
  const form = new FormData();
  form.append('image_file', photo, 'photo.jpg');
  form.append('format', 'png');
  form.append('crop', 'true');
  const res = await fetch(`${process.env.PHOTOROOM_API_BASE || 'https://sdk.photoroom.com'}/v1/segment`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.PHOTOROOM_API_KEY! },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Photoroom ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * The photo with a see-through background, trimmed around the people, as a
 * WebP (much smaller than PNG). Throws if the cut-out service can't do it.
 */
export async function removeBackground(photo: Blob): Promise<{ bytes: Uint8Array; type: string }> {
  const p = provider();
  if (!p) throw new Error('No background removal service is set up');
  const cut = p === 'fapihub' ? await callFapihub(photo) : await callPhotoroom(photo);
  const out = await sharp(cut)
    .trim() // remove the empty see-through edges
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 90 })
    .toBuffer();
  return { bytes: new Uint8Array(out), type: 'image/webp' };
}
