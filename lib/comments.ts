// What the big screen shows under a sprayer's name: the comment they typed in
// their bank app, only if it's polite. Rude comments are dropped silently (never
// starred out). No server-only imports, so it can be tested directly.

import { hasProfanity, MAX_MESSAGE_LENGTH } from './text.ts';
import type { CommentModeration } from './types';

// Insults that are fine in a name (so not in the name filter) but never in a comment on the big screen.
const RUDE_WORDS = [
  'idiot', 'stupid', 'mumu', 'werey', 'weyrey', 'olodo', 'ode', 'fool', 'foolish', 'dumb', 'moron', 'yeye', 'useless',
  'oloriburuku', 'didirin', 'ewu', 'onye ara', 'ashawo', 'ashewo', 'bastard', 'sex', 'sexy', 'penis', 'vagina', 'boobs',
  'naked', 'death to', 'thunder fire', 'thunder go fire', 'juju',
];
const RUDE_RE = new RegExp(`(?<![\\p{L}])(${RUDE_WORDS.join('|')})(s|es|ing|ed)?(?![\\p{L}])`, 'iu');
// "your papa", "your mama", "ya fada": insults about someone's parents.
const PARENT_RE = /\b(your|ur|ya|yo)\s+(papa|mama|father|mother|fada|mumsy|daddy)\b/i;
// Words already starred out ("s***"), links, and long numbers (phone or account numbers) never go on screen.
const MASKED_RE = /\p{L}\*{2,}/u;
const LINK_RE = /(https?:\/\/|www\.|\.(com|ng|net|org|io|me|ly)\b)/i;
const NUMBER_RE = /\d[\d\s-]{6,}\d/;

/** True if a comment should not go on the big screen, by the simple word check (no AI). */
export function isRudeComment(text: string): boolean {
  return hasProfanity(text) || RUDE_RE.test(text) || PARENT_RE.test(text) || MASKED_RE.test(text) || LINK_RE.test(text) || NUMBER_RE.test(text);
}

/** How long the screen waits for the AI check of a new comment before falling back to the word check. */
export const AI_WAIT_MS = 20_000;

type CommentFields = {
  message: string | null;
  hidden: boolean;
  moderation?: CommentModeration | null;
  screenMessage?: string | null;
  createdAt: string;
};

/**
 * The comment the big screen shows under a sprayer's name, or null.
 * - `show`: the planner's "show comments" switch.
 * - `ai`: the planner's "check comments with AI" switch; `aiReady`: an AI key is set up.
 * The word check always runs too, even after the AI said yes.
 */
export function screenComment(t: CommentFields, opts: { show: boolean; ai: boolean; aiReady: boolean; now?: number }): string | null {
  if (!opts.show || t.hidden || !t.message) return null;
  let text: string | null = t.message;
  if (opts.ai && t.moderation && t.moderation !== 'failed') {
    if (t.moderation === 'blocked') return null;
    if (t.moderation === 'rewritten') text = t.screenMessage ?? null;
  } else if (opts.ai && opts.aiReady && !t.moderation) {
    // Still being checked: wait a moment (the name shows straight away; the comment joins it once checked).
    if ((opts.now ?? Date.now()) - new Date(t.createdAt).getTime() < AI_WAIT_MS) return null;
  }
  text = text?.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_LENGTH) || null;
  return text && !isRudeComment(text) ? text : null;
}
