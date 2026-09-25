import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSenderName } from '../lib/narration.ts';

const receivers = ['SPENDBOX/DASHPAD TOLU AND DAYO', 'DashPad'];

test('sender name: the usual field', () => {
  assert.equal(findSenderName({ authorization: { sender_name: 'CHIDI OKAFOR' } }, receivers), 'CHIDI OKAFOR');
});

test('sender name: banks that leave sender_name empty (e.g. GTBank)', () => {
  // Another field that is plainly the sender's name.
  assert.equal(findSenderName({ authorization: { sender_name: null, originator_name: 'ADA OBI' } }, receivers), 'ADA OBI');
  // Only in the description the bank wrote.
  assert.equal(
    findSenderName({ channel: 'dedicated_nuban', authorization: { sender_name: '', narration: 'MOB TRF FRM TUNDE BAKARE TO SPENDBOX/DASHPAD TOLU AND DAYO' } }, receivers),
    'TUNDE BAKARE',
  );
  assert.equal(findSenderName({ authorization: { narration: 'Transfer from Funmi Alade' } }, receivers), 'Funmi Alade');
});

test('sender name: never the receiving account, a bank or a reference', () => {
  assert.equal(findSenderName({ authorization: { sender_name: 'SPENDBOX/DASHPAD TOLU AND DAYO' } }, receivers), null);
  assert.equal(findSenderName({ authorization: { narration: 'TRF FRM GTBANK PLC REF 000123' } }, receivers), null);
  assert.equal(findSenderName({ authorization: { narration: 'Happy birthday!' } }, receivers), null);
});
