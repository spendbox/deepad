import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correction } from '../lib/rotator.ts';

test('the big screen picture is turned upright however the phone is held', () => {
  // The screen turned with the phone (auto-rotate on): nothing to fix.
  assert.equal(correction(0, 0), 0);
  assert.equal(correction(90, 90), 0);
  // Rotation lock on, phone held sideways (top to the left): turn the picture back a quarter.
  assert.equal(correction(90, 0), 270);
  // Held sideways the other way.
  assert.equal(correction(270, 0), 90);
  // Screen locked sideways (camera mode) but the phone held the other way round.
  assert.equal(correction(270, 90), 180);
});
