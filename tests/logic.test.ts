import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { feesInside, feesOnTop, groupAccountNumber, naira } from '../lib/money.ts';
import { cleanMessage, cleanNarration, filterProfanity, formatSenderName } from '../lib/text.ts';
import { isValidPaystackSignature } from '../lib/paystack-signature.ts';
import { computeStats } from '../lib/store/types.ts';

test('fees on top: guest pays spray + 5% + MC share', () => {
  const f = feesOnTop(10_000_00, { platformFeeBps: 500, mcFeeBps: 200 });
  assert.equal(f.platformFeeKobo, 500_00);
  assert.equal(f.mcFeeKobo, 200_00);
  assert.equal(f.totalKobo, 10_700_00);
  assert.equal(f.celebrantKobo, 10_000_00);
});

test('fees inside: direct transfer shows full amount, fee comes out', () => {
  const f = feesInside(10_000_00, { platformFeeBps: 500, mcFeeBps: 200 });
  assert.equal(f.sprayKobo, 10_000_00);
  assert.equal(f.celebrantKobo, 9_300_00);
});

test('naira formatting', () => {
  assert.equal(naira(2_000_000), '₦20,000');
  assert.equal(naira(2_000_050), '₦20,000.50');
});

test('account number grouping', () => {
  assert.equal(groupAccountNumber('0123456789'), '0123 456 789');
});

test('sender name: first name + surname initial', () => {
  assert.equal(formatSenderName('OLUWASEUN ADEBAYO'), 'Oluwaseun A.');
  assert.equal(formatSenderName('CHIDI'), 'Chidi');
  assert.equal(formatSenderName(''), 'A guest');
  assert.equal(formatSenderName(null), 'A guest');
  assert.equal(formatSenderName('  ngozi   mary  okafor '), 'Ngozi O.');
});

test('profanity is masked', () => {
  assert.equal(filterProfanity('what the fuck'), 'what the f***');
  assert.equal(filterProfanity('Shittu family'), 'Shittu family');
  assert.equal(filterProfanity('fucking hell'), 'f****** hell');
  assert.equal(filterProfanity('Congratulations'), 'Congratulations');
});

test('messages are trimmed to 60 characters', () => {
  assert.equal(cleanMessage('a'.repeat(80))!.length, 60);
  assert.equal(cleanMessage('   '), null);
});

test('bank narration keeps the sender’s own words', () => {
  assert.equal(cleanNarration('Happy married life!'), 'Happy married life!');
  assert.equal(cleanNarration('NIP/OLUWASEUN ADEBAYO/Congrats Tolu', 'OLUWASEUN ADEBAYO'), 'Congrats Tolu');
  assert.equal(cleanNarration('MOB/UTO/Dance well o', null), 'Dance well o');
  assert.equal(cleanNarration('TRF FROM OLUWASEUN ADEBAYO', 'OLUWASEUN ADEBAYO'), null);
  assert.equal(cleanNarration('OLUWASEUN ADEBAYO', 'OLUWASEUN ADEBAYO'), null);
  assert.equal(cleanNarration(''), null);
  assert.equal(cleanNarration('Transfer of love to the couple'), 'Transfer of love to the couple');
});

test('paystack signature check', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'X' } });
  const sig = createHmac('sha512', 'sk_test_abc').update(body).digest('hex');
  assert.equal(isValidPaystackSignature(body, sig, 'sk_test_abc'), true);
  assert.equal(isValidPaystackSignature(body, sig, 'sk_test_wrong'), false);
  assert.equal(isValidPaystackSignature(body + ' ', sig, 'sk_test_abc'), false);
  assert.equal(isValidPaystackSignature(body, null, 'sk_test_abc'), false);
});

test('leaderboard groups by name and skips anonymous', () => {
  const s = computeStats([
    { displayName: 'Uncle Tunde', anonymous: false, amountKobo: 100 },
    { displayName: 'uncle tunde ', anonymous: false, amountKobo: 300 },
    { displayName: 'Anonymous guest', anonymous: true, amountKobo: 1000 },
    { displayName: 'Aunty Ngozi', anonymous: false, amountKobo: 200 },
  ]);
  assert.equal(s.totalKobo, 1600);
  assert.equal(s.count, 4);
  assert.deepEqual(s.leaderboard.map((r) => [r.name, r.amountKobo]), [['Uncle Tunde', 400], ['Aunty Ngozi', 200]]);
});
