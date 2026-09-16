import test from 'node:test';
import assert from 'node:assert/strict';

import { simplifyGuitarNotationDurations } from '../src/reconstruction/notationSimplification.js';

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

test('S12.3 caps a small same-register overlap to the next attack', () => {
  const input = [event('a', 60, 0, 0.55), event('b', 62, 0.5, 0.4)];
  const snapshot = JSON.stringify(input);
  const result = simplifyGuitarNotationDurations(input, { bpm: 120 });

  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(result.melodicContinuityAdjustmentCount, 1);
  assert.equal(result.melodicOverlapCappedCount, 1);
  assert.equal(result.simplifiedEvents[0].offsetSeconds, 0.5);
  assert.ok(result.diagnostics.some((item) => item.code === 'GUITAR_MELODIC_CONTINUITY_RECONSTRUCTED'));
});

test('S12.3 fills a tiny same-register gap to the next attack', () => {
  const result = simplifyGuitarNotationDurations([
    event('a', 64, 0, 0.46),
    event('b', 67, 0.5, 0.4),
  ], { bpm: 120 });

  assert.equal(result.melodicGapFilledCount, 1);
  assert.equal(result.simplifiedEvents[0].offsetSeconds, 0.5);
});

test('S12.3 preserves large overlaps as possible real polyphony', () => {
  const result = simplifyGuitarNotationDurations([
    event('bass', 48, 0, 1.2),
    event('upper', 52, 0.5, 0.4),
  ], { bpm: 120 });

  assert.equal(result.melodicContinuityAdjustmentCount, 0);
  assert.equal(result.simplifiedEvents[0].offsetSeconds, 1.2);
});

test('S12.3 preserves register-separated overlap', () => {
  const result = simplifyGuitarNotationDurations([
    event('bass', 40, 0, 0.55),
    event('melody', 64, 0.5, 0.4),
  ], { bpm: 120 });

  assert.equal(result.melodicContinuityAdjustmentCount, 0);
  assert.equal(result.simplifiedEvents[0].offsetSeconds, 0.55);
});
