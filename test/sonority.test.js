import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeSonoritySpans, rational } from '../src/index.js';

function event(eventId, midiPitch, onsetQuarter, durationQuarter) {
  return Object.freeze({ eventId, midiPitch, onsetQuarter, durationQuarter });
}

test('same-onset notes form a chord-attack sonority span', () => {
  const analysis = analyzeSonoritySpans([
    event('c4', 60, rational(0), rational(1)),
    event('e4', 64, rational(0), rational(1)),
  ]);

  assert.equal(analysis.spans.length, 1);
  assert.equal(analysis.spans[0].classification, 'CHORD_ATTACK');
  assert.deepEqual(analysis.spans[0].activeEventIds, ['c4', 'e4']);
  assert.deepEqual(analysis.spans[0].attackEventIds, ['c4', 'e4']);
  assert.deepEqual(analysis.spans[0].sustainedEventIds, []);
  assert.equal(analysis.maxSimultaneousNotes, 2);
  assert.equal(analysis.hasSustainedOverlap, false);
});

test('sustained bass remains active when a later upper note attacks', () => {
  const analysis = analyzeSonoritySpans([
    event('bass', 48, rational(0), rational(2)),
    event('upper', 64, rational(1), rational(1, 2)),
  ]);

  assert.equal(analysis.spans.length, 3);
  assert.equal(analysis.spans[0].classification, 'MONOPHONIC');
  assert.equal(analysis.spans[1].classification, 'SUSTAINED_OVERLAP');
  assert.deepEqual(analysis.spans[1].activeEventIds, ['bass', 'upper']);
  assert.deepEqual(analysis.spans[1].attackEventIds, ['upper']);
  assert.deepEqual(analysis.spans[1].sustainedEventIds, ['bass']);
  assert.equal(analysis.spans[2].classification, 'MONOPHONIC');
  assert.equal(analysis.sustainedOverlapCount, 1);
  assert.equal(analysis.hasSustainedOverlap, true);
});

test('half-open interval semantics remove a note exactly at its end boundary', () => {
  const analysis = analyzeSonoritySpans([
    event('a', 60, rational(0), rational(1)),
    event('b', 62, rational(1), rational(1)),
  ]);

  assert.equal(analysis.spans.length, 2);
  assert.deepEqual(analysis.spans[0].activeEventIds, ['a']);
  assert.deepEqual(analysis.spans[1].activeEventIds, ['b']);
  assert.equal(analysis.hasSustainedOverlap, false);
});

test('empty event list yields an empty deterministic analysis', () => {
  const analysis = analyzeSonoritySpans([]);
  assert.equal(analysis.spans.length, 0);
  assert.equal(analysis.maxSimultaneousNotes, 0);
  assert.deepEqual(analysis.endQuarter, rational(0));
});
