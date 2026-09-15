import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeVoiceCandidates,
  materializePolyphonicScore,
  rational,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

function q(eventId, midiPitch, onsetQuarter, durationQuarter) {
  return Object.freeze({ eventId, midiPitch, onsetQuarter, durationQuarter });
}

test('materializer creates per-voice measures and voice-gap rests for sustained polyphony', () => {
  const events = [
    q('bass', 48, rational(0, 1), rational(4, 1)),
    q('upper-1', 64, rational(1, 1), rational(1, 2)),
    q('upper-2', 65, rational(3, 2), rational(1, 2)),
  ];
  const hints = analyzeVoiceCandidates(events);
  const projection = materializePolyphonicScore(events, hints, context);

  assert.equal(projection.voiceCount, 2);
  const bass = projection.voices.find((voice) => voice.voiceId === 'V1');
  const upper = projection.voices.find((voice) => voice.voiceId === 'V2');
  assert.equal(bass.measures[0].rests.length, 0);
  assert.equal(upper.measures[0].rests.length, 2);
  assert.deepEqual(upper.measures[0].rests[0].onsetInMeasure, rational(0, 1));
  assert.deepEqual(upper.measures[0].rests[0].durationQuarter, rational(1, 1));
  assert.deepEqual(upper.measures[0].rests[1].onsetInMeasure, rational(2, 1));
  assert.deepEqual(upper.measures[0].rests[1].durationQuarter, rational(2, 1));
});

test('event crossing several measures becomes reversible tie-candidate segments', () => {
  const events = [
    q('long', 60, rational(7, 2), rational(9, 1)),
  ];
  const hints = analyzeVoiceCandidates(events);
  const projection = materializePolyphonicScore(events, hints, context);

  assert.equal(projection.segmentCount, 4);
  assert.equal(projection.tieCandidateCount, 3);
  assert.deepEqual(projection.segments.map((segment) => segment.measureIndex), [0, 1, 2, 3]);
  assert.deepEqual(projection.segments.map((segment) => segment.tieFromPrevious), [false, true, true, true]);
  assert.deepEqual(projection.segments.map((segment) => segment.tieToNext), [true, true, true, false]);
  assert.ok(projection.segments.every((segment) => segment.sourceEventId === 'long'));
});

test('ambiguous voice choices are warnings, not projection failures', () => {
  const events = [
    q('low', 60, rational(0, 1), rational(2, 1)),
    q('high', 67, rational(1, 1), rational(1, 1)),
    q('next', 64, rational(2, 1), rational(1, 1)),
  ];
  const hints = analyzeVoiceCandidates(events);
  const projection = materializePolyphonicScore(events, hints, context);

  assert.equal(hints.hasAmbiguousAssignments, true);
  assert.ok(projection.warnings.some((warning) => warning.code === 'AMBIGUOUS_VOICE_CONTINUATION_PRESERVED'));
  assert.equal(projection.segments.find((segment) => segment.sourceEventId === 'next').voiceAmbiguous, true);
});

test('same-onset mixed-duration notes remain reversible and preserve split warning', () => {
  const events = [
    q('short', 60, rational(0, 1), rational(1, 2)),
    q('long', 67, rational(0, 1), rational(2, 1)),
  ];
  const hints = analyzeVoiceCandidates(events);
  const projection = materializePolyphonicScore(events, hints, context);

  assert.equal(projection.voiceCount, 1);
  assert.equal(projection.segmentCount, 2);
  assert.ok(projection.warnings.some((warning) => warning.code === 'MIXED_DURATION_CHORD_SPLIT_HINT_PRESERVED'));
  assert.deepEqual(
    projection.segments.map((segment) => segment.sourceEventId).sort(),
    ['long', 'short'],
  );
});
