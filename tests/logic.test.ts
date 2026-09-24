import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { clampPlannerFeeBps, groupAccountNumber, naira, splitTransfer } from '../lib/money.ts';
import { cleanMessage, cleanNarration, filterProfanity, formatSenderName } from '../lib/text.ts';
import { isValidPaystackSignature } from '../lib/paystack-signature.ts';
import { computeStats } from '../lib/store/types.ts';
import { eventPhase } from '../lib/event-info.ts';
import { hashPassword, verifyPassword } from '../lib/passwords.ts';
import { makePlannerToken, passwordVersion, readPlannerToken } from '../lib/auth.ts';
import { slugify, slugProblem } from '../lib/slug.ts';

test('split: DashPad 5%, planner cut, celebrant gets the rest', () => {
  const s = splitTransfer(10_000_00, 1000);
  assert.equal(s.platformFeeKobo, 500_00);
  assert.equal(s.plannerFeeKobo, 1_000_00);
  assert.equal(s.celebrantKobo, 8_500_00);
  assert.equal(s.platformFeeKobo + s.plannerFeeKobo + s.celebrantKobo, 10_000_00);
  const none = splitTransfer(10_000_00, 0);
  assert.equal(none.celebrantKobo, 9_500_00);
});

test('planner cut is limited to 0–45%', () => {
  assert.equal(clampPlannerFeeBps(9000), 4500);
  assert.equal(clampPlannerFeeBps(-5), 0);
  assert.equal(clampPlannerFeeBps(NaN), 0);
  assert.equal(clampPlannerFeeBps(1250), 1250);
});

test('naira formatting', () => {
  assert.equal(naira(2_000_000), '₦20,000');
  assert.equal(naira(2_000_050), '₦20,000.50');
});

test('account number grouping', () => {
  assert.equal(groupAccountNumber('0123456789'), '0123 456 789');
});

test('event phases follow the start and end time', () => {
  const e = { startsAt: '2026-01-01T10:00:00Z', endsAt: '2026-01-01T20:00:00Z' };
  assert.equal(eventPhase(e, Date.parse('2026-01-01T09:59:00Z')), 'upcoming');
  assert.equal(eventPhase(e, Date.parse('2026-01-01T12:00:00Z')), 'live');
  assert.equal(eventPhase(e, Date.parse('2026-01-01T20:00:00Z')), 'ended');
  assert.equal(eventPhase({ ...e, closedAt: '2026-01-01T11:00:00Z' }, Date.parse('2026-01-01T12:00:00Z')), 'ended');
});

test('sender name format (for reports)', () => {
  assert.equal(formatSenderName('OLUWASEUN ADEBAYO'), 'Oluwaseun A.');
  assert.equal(formatSenderName(''), 'A guest');
});

test('profanity is masked, surnames are not', () => {
  assert.equal(filterProfanity('what the fuck'), 'what the f***');
  assert.equal(filterProfanity('fucking hell'), 'f****** hell');
  assert.equal(filterProfanity('Shittu family'), 'Shittu family');
});

test('messages are trimmed to 60 characters', () => {
  assert.equal(cleanMessage('a'.repeat(80))!.length, 60);
  assert.equal(cleanMessage('   '), null);
});

test('bank narration keeps the sender’s own words', () => {
  const who = 'OLUWASEUN ADEBAYO';
  assert.equal(cleanNarration('Happy married life!'), 'Happy married life!');
  assert.equal(cleanNarration('NIP/OLUWASEUN ADEBAYO/Congrats Tolu', who), 'Congrats Tolu');
  assert.equal(cleanNarration('MOB/UTO/Dance well o', null), 'Dance well o');
  assert.equal(cleanNarration('TRF FROM OLUWASEUN ADEBAYO', who), null);
  assert.equal(cleanNarration('Transfer of love to the couple'), 'Transfer of love to the couple');
  assert.equal(cleanNarration('NIP FRM OLUWASEUN ADEBAYO-Happy married life', who), 'Happy married life');
  assert.equal(cleanNarration('WEB TRANSFER FROM OLUWASEUN ADEBAYO - Congrats', who), 'Congrats');
  assert.equal(cleanNarration('HAPPY BIRTHDAY MAMA', null), 'Happy birthday mama');
  assert.equal(cleanNarration('NIP FRM JOHN DOE-God bless you', null), 'God bless you');
  assert.equal(cleanNarration('Enjoy o! from Oluwaseun', who), 'Enjoy o!');
  assert.equal(cleanNarration('Dance well TO DASHPAD/TOLU AND DAYO', null), 'Dance well');
  assert.equal(cleanNarration('000123456789012/Love you both', null), 'Love you both');
  assert.equal(cleanNarration(''), null);
});

test('paystack signature check', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'X' } });
  const sig = createHmac('sha512', 'sk_test_abc').update(body).digest('hex');
  assert.equal(isValidPaystackSignature(body, sig, 'sk_test_abc'), true);
  assert.equal(isValidPaystackSignature(body, sig, 'sk_test_wrong'), false);
  assert.equal(isValidPaystackSignature(body + ' ', sig, 'sk_test_abc'), false);
  assert.equal(isValidPaystackSignature(body, null, 'sk_test_abc'), false);
});

test('totals skip transfers outside the event time', () => {
  const s = computeStats([
    { amountKobo: 100, outsideWindow: false },
    { amountKobo: 300, outsideWindow: false },
    { amountKobo: 1000, outsideWindow: true },
  ]);
  assert.deepEqual(s, { totalKobo: 400, count: 2 });
});

test('passwords are hashed and checked', async () => {
  const h = await hashPassword('correct horse');
  assert.notEqual(h, 'correct horse');
  assert.equal(await verifyPassword('correct horse', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
});

test('login cookies cannot be forged', async () => {
  const pv = await passwordVersion('scrypt$abc$def');
  const token = (await makePlannerToken('planner-123', pv))!;
  assert.deepEqual(await readPlannerToken(token), { id: 'planner-123', pv });
  const [, exp, , sig] = token.split('.');
  assert.equal(await readPlannerToken(`someone-else.${exp}.${pv}.${sig}`), null);
  assert.equal(await readPlannerToken(`planner-123.${exp}.000000000000.${sig}`), null);
  assert.equal(await readPlannerToken('junk'), null);
});

test('a new password changes the login fingerprint', async () => {
  assert.notEqual(await passwordVersion('scrypt$a$1'), await passwordVersion('scrypt$a$2'));
});

test('event links are short and safe', () => {
  assert.equal(slugify('Tolu & Dayo’s Wedding!'), 'tolu-and-dayos-wedding');
  assert.equal(slugify('  Mama  Kemi @ 60 '), 'mama-kemi-60');
  assert.equal(slugProblem('tolu-and-dayo'), null);
  assert.notEqual(slugProblem('dashboard'), null);
  assert.notEqual(slugProblem('ab'), null);
  assert.notEqual(slugProblem('Tolu_Dayo'), null);
  assert.notEqual(slugProblem('-tolu'), null);
});
