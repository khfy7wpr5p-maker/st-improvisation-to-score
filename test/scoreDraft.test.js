import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScoreDraft, rational } from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('same snapped onset becomes a chord and global silence becomes an explicit gap rest', () => {
  const draft = buildScoreDraft([
    { eventId: 'c4', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.5 },
    { eventId: 'e4', midiPitch: 64, onsetSeconds: 0, offsetSeconds: 0.5 },
    { eventId: 'g4', midiPitch: 67, onsetSeconds: 1.0, offsetSeconds: 1.5 },
  ], context);

  assert.equal(draft.status, 'PASS');
  assert.equal(draft.measures.length, 1);
  assert.equal(draft.measures[0].events[0].type, 'chord');
  assert.equal(draft.measures[0].events[0].notes.length, 2);
  assert.equal(draft.measures[0].events[1].type, 'rest');
  assert.equal(draft.measures[0].events[1].scope, 'GLOBAL_SILENCE');
  assert.deepEqual(draft.measures[0].events[1].onsetQuarter, rational(1, 1));
  assert.deepEqual(draft.measures[0].events[1].durationQuarter, rational(1, 1));
});

test('sustained polyphony is normal score evidence and does not require review by itself', () => {
  const draft = buildScoreDraft([
    { eventId: 'bass', midiPitch: 48, onsetSeconds: 0, offsetSeconds: 1.0 },
    { eventId: 'upper', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 1.0 },
  ], context);

  assert.equal(draft.status, 'PASS');
  assert.equal(draft.polyphonyPolicy, 'POLYPHONY_IS_DEFAULT');
  assert.equal(draft.polyphony.hasSustainedOverlap, true);
  assert.equal(draft.voiceCandidates.voiceCountHint, 2);
  assert.equal(draft.diagnostics.some((item) => item.code === 'POLYPHONIC_OVERLAP_REQUIRES_REVIEW'), false);
  assert.equal(draft.voiceCandidates.eventVoiceHints.find((item) => item.eventId === 'bass').preferredVoiceId, 'V1');
  assert.equal(draft.voiceCandidates.eventVoiceHints.find((item) => item.eventId === 'upper').preferredVoiceId, 'V2');
});

test('cross-measure duration is preserved but flagged for later tie reconstruction', () => {
  const draft = buildScoreDraft([
    { eventId: 'long', midiPitch: 60, onsetSeconds: 1.75, offsetSeconds: 2.25 },
  ], context);

  assert.equal(draft.status, 'REVIEW_REQUIRED');
  assert.equal(draft.measures.length, 2);
  assert.ok(draft.diagnostics.some((item) => item.code === 'CROSS_MEASURE_NOTE_REQUIRES_TIE_RECONSTRUCTION'));
});

test('empty transcription yields one complete global-silence rest measure', () => {
  const draft = buildScoreDraft([], context);
  assert.equal(draft.status, 'PASS');
  assert.equal(draft.measures.length, 1);
  assert.equal(draft.measures[0].events.length, 1);
  assert.equal(draft.measures[0].events[0].type, 'rest');
  assert.equal(draft.measures[0].events[0].scope, 'GLOBAL_SILENCE');
  assert.deepEqual(draft.measures[0].events[0].durationQuarter, rational(4, 1));
});
