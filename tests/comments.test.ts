import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRudeComment, screenComment } from '../lib/comments.ts';
import { cleanMessage } from '../lib/text.ts';

const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000).toISOString();
const t = (message: string | null, extra: Record<string, unknown> = {}) => ({ message, hidden: false, createdAt: at(120), ...extra });
const words = { show: true, ai: false, aiReady: false };
const ai = { show: true, ai: true, aiReady: true };

test('polite comments are shown under the name', () => {
  assert.equal(screenComment(t('Happy married life!'), words), 'Happy married life!');
  assert.equal(screenComment(t('Congrats my guy, God bless una'), words), 'Congrats my guy, God bless una');
});

test('rude comments are left out silently (never starred)', () => {
  for (const m of ['you are a fool', 'mumu dey everywhere', 'your papa', 'call me 0803 123 4567', 'www.spam.ng', 'olodo']) {
    assert.equal(isRudeComment(m), true, m);
    assert.equal(screenComment(t(m), words), null, m);
  }
  // Already starred by the name filter ("s***"): still left out.
  assert.equal(screenComment(t(cleanMessage('this party is shit')), words), null);
});

test('names and nice words that look like rude ones are kept', () => {
  for (const m of ['Shittu family says congrats', 'You killed it!', 'Essex crew dey here', 'God bless the couple']) {
    assert.equal(isRudeComment(m), false, m);
  }
});

test('the planner can turn comments off, or hide one', () => {
  assert.equal(screenComment(t('Happy birthday'), { ...words, show: false }), null);
  assert.equal(screenComment(t('Happy birthday', { hidden: true }), words), null);
  assert.equal(screenComment(t(null), words), null);
});

test('the AI check decides when it is on', () => {
  assert.equal(screenComment(t('congrats you f-ing legend', { moderation: 'rewritten', screenMessage: 'Congrats, you legend!' }), ai), 'Congrats, you legend!');
  assert.equal(screenComment(t('some sly insult', { moderation: 'blocked' }), ai), null);
  assert.equal(screenComment(t('Enjoy!', { moderation: 'ok' }), ai), 'Enjoy!');
  // The word check still runs after the AI.
  assert.equal(screenComment(t('you fool', { moderation: 'ok' }), ai), null);
  // AI turned off: its answer is ignored, the word check decides.
  assert.equal(screenComment(t('some sly insult', { moderation: 'blocked' }), { ...ai, ai: false }), 'some sly insult');
  // AI failed: the word check decides.
  assert.equal(screenComment(t('Enjoy!', { moderation: 'failed' }), ai), 'Enjoy!');
});

test('a new comment waits for the AI check, then falls back to the word check', () => {
  assert.equal(screenComment(t('Enjoy!', { createdAt: at(2) }), ai), null);
  assert.equal(screenComment(t('Enjoy!', { createdAt: at(60) }), ai), 'Enjoy!');
  // No AI key set up: no waiting.
  assert.equal(screenComment(t('Enjoy!', { createdAt: at(2) }), { ...ai, aiReady: false }), 'Enjoy!');
});
