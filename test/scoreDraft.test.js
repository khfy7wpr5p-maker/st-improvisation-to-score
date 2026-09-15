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

test('sustained polyphony is normal score evidence and produces a reversible projection', () => {
  const draft = buildScoreDraft([
    { eventId: 'bass', midiPitch: 48, onsetSeconds: 0, offsetSeconds: 1.0 },
    { eventId: 'upper', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 1.0 },
  ], context);

  assert.equal(draft.status, 'PASS');
  assert.equal(draft.polyphonyPolicy, 'POLYPHONY_IS_DEFAULT');
  assert.equal(draft.polyphony.hasSustainedOverlap, true);
  assert.equal(draft.voiceCandidates.voiceCountHint, 2);
  assert.equal(draft.polyphonicProjection.voiceCount, 2);
  assert.equal(draft.polyphonicProjection.authority, 'REVERSIBLE_HEURISTIC_PROJECTION');
  assert.equal(draft.diagnostics.length, 0);
});

test('cross-measure duration is preserved and materialized as tie-candidate segments without forcing review', () => {
  const draft = buildScoreDraft([
    { eventId: 'long', midiPitch: 60, onsetSeconds: 1.75, offsetSeconds: 2.25 },
  ], context);

  assert.equal(draft.status, 'PASS');
  assert.equal(draft.measures.length, 2);
  assert.equal(draft.diagnostics.length, 0);
  assert.equal(draft.polyphonicProjection.tieCandidateCount, 1);
  assert.equal(draft.polyphonicProjection.segments.length, 2);
  assert.equal(draft.polyphonicProjection.segments[0].tieToNext, true);
  assert.equal(draft.polyphonicProjection.segments[1].tieFromPrevious, true);
  assert.deepEqual(draft.polyphonicProjection.segments[0].durationQuarter, rational(1, 2));
  assert.deepEqual(draft.polyphonicProjection.segments[1].durationQuarter, rational(1, 2));
});

test('cross-measure sustain prevents false global-silence rest while the note is still sounding', () => {
  const draft = buildScoreDraft([
    { eventId: 'long', midiPitch: 60, onsetSeconds: 1.75, offsetSeconds: 2.25 },
  ], context);

  const secondMeasureRests = draft.measures[1].events.filter((event) => event.type === 'rest');
  assert.equal(secondMeasureRests.length, 1);
  assert.deepEqual(secondMeasureRests[0].onsetQuarter, rational(1, 2));
  assert.deepEqual(secondMeasureRests[0].durationQuarter, rational(7, 2));
});

test('empty transcription yields one complete global-silence rest measure and an empty projection', () => {
  const draft = buildScoreDraft([], context);
  assert.equal(draft.status, 'PASS');
  assert.equal(draft.measures.length, 1);
  assert.equal(draft.measures[0].events.length, 1);
  assert.equal(draft.measures[0].events[0].type, 'rest');
  assert.equal(draft.measures[0].events[0].scope, 'GLOBAL_SILENCE');
  assert.deepEqual(draft.measures[0].events[0].durationQuarter, rational(4, 1));
  assert.equal(draft.polyphonicProjection.voiceCount, 0);
  assert.equal(draft.polyphonicProjection.segmentCount, 0);
});
