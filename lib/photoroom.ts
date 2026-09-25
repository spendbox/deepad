import 'server-only';

// Background removal by Photoroom (photoroom.com/api), done when a celebrant
// photo is uploaded. Costs a little per photo, so it only runs when the
// planner leaves "Remove background" on. PHOTOROOM_API_KEY goes in Vercel.

const API = process.env.PHOTOROOM_API_BASE || 'https://sdk.photoroom.com';

export function photoroomConfigured(): boolean {
  return !!process.env.PHOTOROOM_API_KEY;
}

/** Sandbox keys are free for testing but add a watermark. */
export function photoroomIsSandbox(): boolean {
  return (process.env.PHOTOROOM_API_KEY ?? '').startsWith('sandbox_');
}

/**
 * Returns the photo as a PNG with a see-through background, cropped
 * around the people. Throws if Photoroom can't do it.
 */
export async function removeBackground(photo: Blob): Promise<Uint8Array> {
  const key = process.env.PHOTOROOM_API_KEY;
  if (!key) throw new Error('PHOTOROOM_API_KEY is not set');
  const form = new FormData();
  form.append('image_file', photo, 'photo.jpg');
  form.append('format', 'png');
  form.append('crop', 'true');
  const res = await fetch(`${API}/v1/segment`, {
    method: 'POST',
    headers: { 'x-api-key': key },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Photoroom ${res.status}: ${detail}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
