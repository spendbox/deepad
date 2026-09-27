import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteIntervalMs, sprayDurationMs } from '../lib/spray-pace.ts';

test('bigger sprays throw faster', () => {
  assert.equal(noteIntervalMs(5_000), 2500); // one note every 2.5 s
  assert.equal(noteIntervalMs(10_000), 1750); // every 1.75 s
  assert.equal(noteIntervalMs(100_000), 600); // about twice a second
  const a = noteIntervalMs(7_000);
  assert.ok(a < 2500 && a > 1750);
  assert.equal(noteIntervalMs(200), 3000);
  assert.equal(noteIntervalMs(2_000_000), 500);
});

test('how long people keep spraying', () => {
  assert.equal(sprayDurationMs(50), 125_000); // ₦5,000: about 2 minutes
  assert.equal(sprayDurationMs(100), 175_000); // ₦10,000: about 3 minutes
  assert.equal(sprayDurationMs(1_000), 600_000); // ₦100,000: 10 minutes
  assert.equal(sprayDurationMs(1), 8000); // ₦100: still long enough to read the name
  assert.equal(sprayDurationMs(100_000), 30 * 60_000); // never more than 30 minutes
});
