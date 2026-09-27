import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSenderAccount } from '../lib/sender-account.ts';

test('the account a payment came from', () => {
  assert.deepEqual(findSenderAccount({ data: { authorization: { sender_bank_account_number: '0123456789' } } }), { value: '0123456789', full: true });
  assert.deepEqual(findSenderAccount({ authorization: { sender_bank_account_number: 'XXXXXX6789' } }), { value: 'XXXXXX6789', full: false });
  assert.deepEqual(findSenderAccount({ metadata: { originator_account_number: 123456789 } }), { value: '123456789', full: false });
  // The receiving account is never mistaken for the sender's.
  assert.equal(findSenderAccount({ authorization: { receiver_bank_account_number: '9012345678' } }), null);
  assert.equal(findSenderAccount(null), null);
});
