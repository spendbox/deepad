import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharpFromTheStart } from '../lib/webrtc.ts';

const SDP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=rtpmap:111 opus/48000/2',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98',
  'a=rtpmap:96 VP8/90000',
  'a=rtpmap:97 rtx/90000',
  'a=fmtp:97 apt=96',
  'a=rtpmap:98 H264/90000',
  'a=fmtp:98 profile-level-id=42e01f',
  '',
].join('\r\n');

test('the phone starts with a sharp picture: video codecs get a start bitrate', () => {
  const out = sharpFromTheStart(SDP);
  assert.match(out, /a=fmtp:96 x-google-start-bitrate=1500;/); // VP8 had no fmtp line: one is added
  assert.match(out, /a=fmtp:98 profile-level-id=42e01f;x-google-start-bitrate=1500;/);
  assert.match(out, /a=fmtp:97 apt=96\r\n/); // retransmission line left alone
  assert.match(out, /a=fmtp:111 minptime=10;useinbandfec=1\r\n/); // audio left alone
  assert.equal(sharpFromTheStart(out), out); // doing it twice changes nothing
});
