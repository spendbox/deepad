import 'server-only';
import { MAX_MESSAGE_LENGTH } from './text';
import type { CommentModeration } from './types';

// The AI check for comments on the big screen (OpenAI). Set OPENAI_API_KEY in
// Vercel to switch it on; without it, the simple word filter does the job alone.

export function aiFilterConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

const INSTRUCTIONS = `You check short comments that guests type in their bank app when they send money to celebrate someone at a Nigerian party (wedding, birthday, burial, graduation and so on). The comment is shown on a big screen in front of everyone, including family and elders. Guests write in English, Nigerian Pidgin, Yoruba, Igbo, Hausa and slang.

Reply with JSON only: {"verdict": "ok" | "rewrite" | "block", "text": "..."}
- "ok": friendly, neutral or harmless (wishes, prayers, praise, gentle jokes, names, emojis). "text" is the comment unchanged.
- "rewrite": the guest clearly meant well but used a swear word or crude phrase (for example "congrats you f**king legend"). "text" is the same wish made polite and warm, in the same language, at most ${MAX_MESSAGE_LENGTH} characters. Add nothing new.
- "block": insults, curses (including spiritual curses), sexual content, hate, threats, mocking the celebrant or the dead, political or tribal attacks, adverts, links, phone or account numbers, or anything that would embarrass the celebrant. "text" is "".
If you are unsure, choose "block".`;

/**
 * Ask the AI about one comment. Never throws: if the AI can't be reached (or
 * takes too long) the result is 'failed' and the word filter decides instead.
 */
export async function moderateComment(comment: string): Promise<{ moderation: CommentModeration; screenMessage: string | null }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { moderation: 'failed', screenMessage: null };
  try {
    const res = await fetch(`${process.env.OPENAI_API_BASE || 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: INSTRUCTIONS },
          { role: 'user', content: JSON.stringify({ comment }) },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const out = JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as { verdict?: string; text?: string };
    const text = typeof out.text === 'string' ? out.text.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_LENGTH) : '';
    if (out.verdict === 'ok') return { moderation: 'ok', screenMessage: comment };
    if (out.verdict === 'rewrite' && text) return { moderation: 'rewritten', screenMessage: text };
    if (out.verdict === 'block' || out.verdict === 'rewrite') return { moderation: 'blocked', screenMessage: null };
    throw new Error('Unexpected answer');
  } catch (err) {
    console.error('Comment check failed', err);
    return { moderation: 'failed', screenMessage: null };
  }
}
