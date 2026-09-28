import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addThrows, biggestNoteFor, thrownNaira } from '../lib/wad.ts';

test('what has been thrown', () => {
  assert.equal(thrownNaira({ '500': 2, '100': 3 }), 1300);
  assert.equal(thrownNaira({ '50': 9, '1000': -2 }), 0); // unknown notes and nonsense are ignored
  assert.equal(thrownNaira(null), 0);
});

test('never throw more than was paid', () => {
  assert.deepEqual(addThrows({}, { '500': 3 }, 5000), { thrown: { '500': 3 }, added: 3 });
  assert.deepEqual(addThrows({ '500': 9 }, { '500': 3 }, 5000), { thrown: { '500': 10 }, added: 1 });
  assert.deepEqual(addThrows({ '1000': 5 }, { '100': 1 }, 5000), { thrown: { '1000': 5 }, added: 0 });
  assert.deepEqual(addThrows({}, { '1000': 1, '200': 5 }, 1500), { thrown: { '1000': 1, '200': 2 }, added: 3 });
  assert.equal(addThrows({}, { '100': 'lots' }, 5000).added, 0);
});

test('the note to throw next', () => {
  assert.equal(biggestNoteFor(5000, 500), 500);
  assert.equal(biggestNoteFor(300, 500), 200);
  assert.equal(biggestNoteFor(50, 100), null);
});
