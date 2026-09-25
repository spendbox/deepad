// Small helpers shared by the camera phone and the big screen (browser only).

export type IceServers = RTCIceServer[];

/** Connection addresses from our server (free STUN, plus Cloudflare's relay when set up). */
export async function fetchIce(url: string): Promise<IceServers> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) return ((await res.json()) as { iceServers: IceServers }).iceServers;
  } catch {}
  return [{ urls: 'stun:stun.l.google.com:19302' }];
}

/**
 * Wait until the browser has found its connection routes, so the whole
 * offer/answer can be sent in one go. Gives up after `ms` and uses what it has.
 */
export function iceGathered(pc: RTCPeerConnection, ms = 3500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const t = setTimeout(done, ms);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

/**
 * Ask the phone to start sending a sharp picture straight away, instead of
 * starting tiny and slowly sharpening over ~20 seconds (Chrome/Android start
 * low by default). Applied to the answer the phone receives; other browsers ignore it.
 */
export function sharpFromTheStart(sdp: string, startKbps = 1500, minKbps = 600, maxKbps = 2500): string {
  const extra = `x-google-start-bitrate=${startKbps};x-google-min-bitrate=${minKbps};x-google-max-bitrate=${maxKbps}`;
  const lines = sdp.split('\r\n');
  const out: string[] = [];
  let inVideo = false;
  const withFmtp = new Set<string>();
  for (const l of lines) {
    if (l.startsWith('m=')) inVideo = l.startsWith('m=video');
    const f = inVideo && /^a=fmtp:(\d+) /.exec(l);
    if (f) withFmtp.add(f[1]);
  }
  for (const l of lines) {
    if (l.startsWith('m=')) inVideo = l.startsWith('m=video');
    const fmtp = inVideo && /^a=fmtp:(\d+) (.*)$/.exec(l);
    const rtp = inVideo && /^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//i.exec(l);
    if (fmtp && !fmtp[2].includes('x-google-start-bitrate') && !/apt=/.test(fmtp[2])) {
      out.push(`${l};${extra}`);
      continue;
    }
    out.push(l);
    if (rtp && !withFmtp.has(rtp[1])) out.push(`a=fmtp:${rtp[1]} ${extra}`);
  }
  return out.join('\r\n');
}
