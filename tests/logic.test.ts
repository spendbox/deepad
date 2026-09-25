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
import { collectNarrations, pickNarration } from '../lib/narration.ts';

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

test('the receiving account’s own name is never shown as a message', () => {
  const R = ['SPENDBOX/DASHPAD TOLU & DAYO', 'DashPad'];
  assert.equal(cleanNarration('SPENDBOX/DASHPA', 'JOHN DOE', R), null);
  assert.equal(cleanNarration('Spendbox/Dashpad Tolu', null, R), null);
  assert.equal(cleanNarration('SPENDBOX/DASHPA Happy birthday', null, R), 'Happy birthday');
  assert.equal(cleanNarration('TRF TO SPENDBOX/DASHPAD - Congrats o', null, R), 'Congrats o');
  assert.equal(cleanNarration('Happy married life Tolu', null, R), 'Happy married life Tolu');
  assert.equal(cleanNarration('Spend wisely my darling', null, R), 'Spend wisely my darling');
});

test('the best description is picked from Paystack’s notification', () => {
  const data = {
    authorization: { narration: 'SPENDBOX/DASHPA', sender_name: 'JOHN DOE' },
    metadata: { custom_fields: [{ variable_name: 'narration', value: 'God bless this home' }] },
  };
  const all = collectNarrations(data);
  assert.deepEqual(all, ['SPENDBOX/DASHPA', 'God bless this home']);
  const pick = pickNarration(all, 'JOHN DOE', ['SPENDBOX/DASHPAD TOLU']);
  assert.equal(pick.message, 'God bless this home');
  const none = pickNarration(['SPENDBOX/DASHPA'], null, ['SPENDBOX/DASHPAD TOLU']);
  assert.equal(none.message, null);
  assert.equal(none.raw, 'SPENDBOX/DASHPA');
});

test('hype lines match the amount, or use the planner\'s own', async () => {
  const { hypeFor, hypeLinesFor, HYPE_TIERS } = await import('../lib/hype.ts');
  const big = hypeFor(100_000_00, 1, [], 'Kemi');
  assert.ok(HYPE_TIERS[0].lines.includes(big));
  const small = hypeFor(500_00, 2, [], 'Kemi');
  assert.ok(HYPE_TIERS[3].lines.map((l) => l.replaceAll('{name}', 'Kemi')).includes(small));
  assert.equal(hypeFor(500_00, 5, [], 'Kemi'), hypeFor(500_00, 5, [], 'Kemi'));
  const own = hypeLinesFor(['  Spray {name}! ', '']);
  assert.deepEqual(own, ['Spray {name}!']);
  assert.equal(hypeFor(1_000_00, 3, own, 'Kemi'), 'Spray Kemi!');
});

test('more money, more confetti', async () => {
  const { confettiVolume } = await import('../lib/confetti.ts');
  const total = (k: number) => confettiVolume(k).waves * confettiVolume(k).perWave;
  assert.ok(total(500_00) < total(5_000_00) && total(5_000_00) < total(50_000_00) && total(50_000_00) < total(1_000_000_00));
  const small = confettiVolume(500_00);
  const big = confettiVolume(100_000_00);
  assert.ok(big.waves * big.perWave > small.waves * small.perWave * 4);
});

test('earnings are grouped into Nigerian days, weeks and months', async () => {
  const { bucketize, rangeWindow } = await import('../lib/earnings.ts');
  const now = Date.parse('2026-09-24T12:00:00Z');
  const w = rangeWindow('7d', now, null);
  const items = [
    { at: Date.parse('2026-09-24T09:00:00Z'), kobo: 100 },
    { at: Date.parse('2026-09-23T23:30:00Z'), kobo: 50 }, // 00:30 on the 24th in Lagos
    { at: Date.parse('2026-09-20T10:00:00Z'), kobo: 7 },
    { at: Date.parse('2026-09-01T10:00:00Z'), kobo: 999 }, // outside 7 days
  ];
  const b = bucketize(items, w.from, w.unit, now);
  assert.equal(b.length, 7);
  assert.equal(b[6].label, '24 Sep');
  assert.equal(b[6].kobo, 150);
  assert.equal(b.reduce((s, x) => s + x.kobo, 0), 157);
  const m = rangeWindow('12m', now, null);
  assert.equal(bucketize([], m.from, m.unit, now).length, 12);
});

test('custom theme colours: every random pair stays readable', async () => {
  const { paletteFromColors, contrast, CONTRAST } = await import('../lib/colors.ts');
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hex = () => '#' + Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0');
  const fixed = [['#FFFFFF', '#FFFFFF'], ['#000000', '#000000'], ['#808080', '#808080'], ['#FF0000', '#00FF00'], ['#FFFF00', '#FFFFFF']];
  const pairs = [...fixed, ...Array.from({ length: 800 }, () => [hex(), hex()])];
  for (const [p, s] of pairs) {
    const t = paletteFromColors(p, s);
    const why = `${p} / ${s} → ${JSON.stringify(t)}`;
    assert.ok(contrast(t.text, t.bg) >= CONTRAST.text, 'text on bg ' + why);
    assert.ok(contrast(t.text, t.panel) >= CONTRAST.text, 'text on panel ' + why);
    assert.ok(contrast(t.muted, t.bg) >= CONTRAST.muted && contrast(t.muted, t.panel) >= CONTRAST.muted, 'muted ' + why);
    assert.ok(contrast(t.accent, t.bg) >= CONTRAST.accent && contrast(t.accent, t.panel) >= CONTRAST.accent, 'accent ' + why);
    assert.ok(contrast(t.onAccent, t.accent) >= CONTRAST.onAccent, 'on accent ' + why);
  }
  // A good pair is left exactly as chosen.
  const owambe = paletteFromColors('#1F0A26', '#F2B437');
  assert.equal(owambe.bg, '#1F0A26');
  assert.equal(owambe.accent, '#F2B437');
  assert.deepEqual(owambe.notes, []);
});
