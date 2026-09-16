import test from 'node:test';
import assert from 'node:assert/strict';

import {
  simplifyGuitarNotationDurations,
} from '../src/reconstruction/notationSimplification.js';

function event(eventId, pitch, onset, duration) {
  return Object.freeze({
    eventId,
    midiPitch: pitch,
    onsetSeconds: onset,
    offsetSeconds: onset + duration,
    confidence: null,
    amplitude: 0.8,
    sourceEventId: `src:${eventId}`,
  });
}

test('S12.2 aligns near-equal same-attack durations to the next attack without mutating input', () => {
  const input = [
    event('c', 60, 0, 0.42),
    event('e', 64, 0, 0.48),
    event('g', 67, 0, 0.51),
    event('next', 69, 0.5, 0.25),
  ];
  const snapshot = JSON.stringify(input);
  const result = simplifyGuitarNotationDurations(input, { bpm: 120 });

  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(result.simplifiedGroupCount, 1);
  assert.equal(result.adjustedEventCount, 3);
  assert.equal(result.simplifiedEvents.find((item) => item.eventId === 'c').offsetSeconds, 0.5);
  assert.equal(result.simplifiedEvents.find((item) => item.eventId === 'e').offsetSeconds, 0.5);
  assert.equal(result.simplifiedEvents.find((item) => item.eventId === 'g').offsetSeconds, 0.5);
  assert.ok(result.diagnostics.some((item) => item.code === 'GUITAR_NOTATION_CHORD_DURATIONS_SIMPLIFIED'));
});

test('S12.2 normalizes tightly clustered chord durations when no next attack is available', () => {
  const result = simplifyGuitarNotationDurations([
    event('c', 60, 0, 0.5),
    event('e', 64, 0, 0.55),
    event('g', 67, 0, 0.62),
  ], { bpm: 120 });

  assert.equal(result.simplifiedGroupCount, 1);
  assert.equal(result.simplifiedEvents.find((item) => item.eventId === 'c').offsetSeconds, 0.55);
  assert.equal(result.simplifiedEvents.find((item) => item.eventId === 'e').offsetSeconds, 0.55);
  assert.equal(result.simplifiedEvents.find((item) => item.eventId === 'g').offsetSeconds, 0.55);
});

test('S12.2 preserves materially independent same-onset durations', () => {
  const result = simplifyGuitarNotationDurations([
    event('short', 60, 0, 0.25),
    event('long', 67, 0, 1.5),
  ], { bpm: 120 });

  assert.equal(result.simplifiedGroupCount, 0);
  assert.equal(result.adjustedEventCount, 0);
  assert.equal(result.simplifiedEvents[0].offsetSeconds, 0.25);
  assert.equal(result.simplifiedEvents[1].offsetSeconds, 1.5);
});
