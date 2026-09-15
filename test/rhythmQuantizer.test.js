import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRawPerformanceEvent,
  quantizePerformanceEvent,
  rational,
  secondsToQuarterNotes,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('seconds map to quarter-note time under known tempo', () => {
  assert.equal(secondsToQuarterNotes(0.5, 120), 1);
  assert.equal(secondsToQuarterNotes(1.0, 60), 1);
});

test('known-tempo event quantizes deterministically', () => {
  const result = quantizePerformanceEvent({
    eventId: 'n1',
    midiPitch: 60,
    onsetSeconds: 0.5,
    offsetSeconds: 0.75,
    confidence: 0.9,
  }, context);

  assert.deepEqual(result.onsetQuarter, rational(1, 1));
  assert.deepEqual(result.durationQuarter, rational(1, 2));
  assert.equal(result.confidence, 0.9);
});

test('triplet mode admits eighth-note-triplet positions', () => {
  const result = quantizePerformanceEvent({
    eventId: 'triplet',
    midiPitch: 64,
    onsetSeconds: 0.34,
    offsetSeconds: 0.68,
  }, {
    bpm: 60,
    meterNumerator: 4,
    meterDenominator: 4,
    smallestNoteDenominator: 16,
    allowTriplets: true,
  });

  assert.deepEqual(result.onsetQuarter, rational(1, 3));
  assert.deepEqual(result.durationQuarter, rational(1, 3));
});

test('raw performance contract rejects impossible pitch and time', () => {
  assert.throws(() => createRawPerformanceEvent({
    eventId: 'bad',
    midiPitch: 200,
    onsetSeconds: 0,
    offsetSeconds: 1,
  }), /midiPitch/);

  assert.throws(() => createRawPerformanceEvent({
    eventId: 'bad-time',
    midiPitch: 60,
    onsetSeconds: 1,
    offsetSeconds: 1,
  }), /offsetSeconds/);
});
