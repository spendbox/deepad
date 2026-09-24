import 'server-only';

// Sends email through Resend (resend.com). Needs RESEND_API_KEY and
// EMAIL_FROM (e.g. "DashPad <reports@dashpad.ng>", on a domain verified in Resend).

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  if (!emailConfigured()) {
    console.warn(`Email not sent (RESEND_API_KEY / EMAIL_FROM missing): "${opts.subject}" to ${opts.to}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
  });
  if (!res.ok) {
    console.error('Resend failed', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
