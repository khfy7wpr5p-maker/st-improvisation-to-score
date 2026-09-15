import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeVoiceCandidates, rational } from '../src/index.js';

function event(eventId, midiPitch, onsetNumerator, onsetDenominator, durationNumerator, durationDenominator) {
  return Object.freeze({
    eventId,
    midiPitch,
    onsetQuarter: rational(onsetNumerator, onsetDenominator),
    durationQuarter: rational(durationNumerator, durationDenominator),
  });
}

test('sustained bass causes a new upper strand and later upper attacks reuse it', () => {
  const result = analyzeVoiceCandidates([
    event('bass', 48, 0, 1, 3, 1),
    event('upper-1', 64, 1, 1, 1, 2),
    event('upper-2', 65, 3, 2, 1, 2),
  ]);

  assert.equal(result.policy, 'POLYPHONY_IS_DEFAULT');
  assert.equal(result.voiceCountHint, 2);
  assert.equal(result.eventVoiceHints.find((item) => item.eventId === 'bass').preferredVoiceId, 'V1');
  assert.equal(result.eventVoiceHints.find((item) => item.eventId === 'upper-1').preferredVoiceId, 'V2');
  assert.equal(result.eventVoiceHints.find((item) => item.eventId === 'upper-2').preferredVoiceId, 'V2');
});

test('voice count grows dynamically when simultaneous independent strands require it', () => {
  const result = analyzeVoiceCandidates([
    event('bass', 40, 0, 1, 4, 1),
    event('middle', 55, 1, 1, 2, 1),
    event('top', 72, 2, 1, 1, 2),
  ]);

  assert.equal(result.voiceCountHint, 3);
  assert.deepEqual(
    result.eventVoiceHints.map((item) => [item.eventId, item.preferredVoiceId]),
    [['bass', 'V1'], ['middle', 'V2'], ['top', 'V3']],
  );
});

test('same-onset notes remain a chord-like attack group instead of forcing one voice per pitch', () => {
  const result = analyzeVoiceCandidates([
    event('c4', 60, 0, 1, 1, 1),
    event('e4', 64, 0, 1, 1, 1),
    event('g4', 67, 0, 1, 1, 1),
  ]);

  assert.equal(result.voiceCountHint, 1);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].chordLike, true);
  assert.deepEqual(result.assignments[0].eventIds, ['c4', 'e4', 'g4']);
});

test('near-equal continuation choices are retained as ambiguity metadata without blocking a preferred hint', () => {
  const result = analyzeVoiceCandidates([
    event('low', 60, 0, 1, 2, 1),
    event('high', 67, 1, 1, 1, 1),
    event('next', 64, 2, 1, 1, 1),
  ]);

  const next = result.assignments.find((item) => item.eventIds.includes('next'));
  assert.equal(result.voiceCountHint, 2);
  assert.equal(next.ambiguous, true);
  assert.equal(typeof next.preferredVoiceId, 'string');
  assert.ok(next.candidates.length >= 2);
  assert.equal(result.hasAmbiguousAssignments, true);
});

test('same-onset mixed durations create a split hint but stay usable', () => {
  const result = analyzeVoiceCandidates([
    event('short', 60, 0, 1, 1, 2),
    event('long', 67, 0, 1, 2, 1),
  ]);

  assert.equal(result.voiceCountHint, 1);
  assert.equal(result.assignments[0].mixedDurations, true);
  assert.equal(result.assignments[0].splitHint, 'SAME_ONSET_MIXED_DURATIONS_MAY_REQUIRE_MULTIPLE_VOICES');
});
