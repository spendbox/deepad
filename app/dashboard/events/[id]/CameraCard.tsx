'use client';

import { useState, useTransition } from 'react';
import CopyButton from '@/components/CopyButton';
import SectionCard from '@/components/SectionCard';
import { cameraLink } from '../../../actions';

/**
 * Live camera on the big screen: a phone (from a secret link) or a camera
 * plugged into the big-screen computer. The video fills the screen, with
 * lines and sprayers floating over it.
 */
export default function CameraCard({ eventId, screenUrl, celebrantName }: { eventId: string; screenUrl: string; celebrantName: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const whatsapp = link ? `https://wa.me/?text=${encodeURIComponent(`Camera link for the big screen (please don’t share it): ${link}`)}` : '';

  return (
    <SectionCard
      icon="camera"
      title="Live camera"
      hint={`Show ${celebrantName} live on the big screen. Lines and sprayers float over the video.`}
    >
      <div className="subcards">
        <div className="subcard">
          <strong>From a phone</strong>
          <span className="hint">
            Send this link to whoever is filming. They open it, tap <b>Go live</b>, and the big screen switches to their video. Keep it private:
            anyone with it can go live.
          </span>
          {link ? (
            <>
              <span className="share-url">{link}</span>
              <div className="actions">
                <CopyButton text={link} label="Copy link" />
                <a href={whatsapp} target="_blank" rel="noreferrer" className="btn btn-sm">Send on WhatsApp</a>
                <button
                  type="button"
                  className="link-btn"
                  disabled={busy}
                  onClick={() => {
                    if (confirm('Make a new camera link? The old one will stop working.')) start(async () => setLink(await cameraLink(eventId, true)));
                  }}
                >
                  Make a new link
                </button>
              </div>
            </>
          ) : (
            <div>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => start(async () => setLink(await cameraLink(eventId)))}>
                {busy ? 'Getting link…' : 'Get the camera link'}
              </button>
            </div>
          )}
        </div>

        <div className="subcard">
          <strong>From a professional camera</strong>
          <span className="hint">
            Plug the camera into the big-screen computer (most need a small HDMI-to-USB capture card). On the big screen, move the mouse,
            click <b>Camera</b> and pick it.
          </span>
        </div>
      </div>
      <p className="hint" style={{ margin: '12px 0 0' }}>
        A big screen opened with this button shows the phone’s video by itself:{' '}
        <a href={screenUrl} target="_blank" rel="noreferrer">Open big screen ↗</a>. Using another computer? Move its mouse and click{' '}
        <b>Show camera on this screen</b>; the video moves there and stops on the others. Phones and tablets never show it.
      </p>
    </SectionCard>
  );
}
