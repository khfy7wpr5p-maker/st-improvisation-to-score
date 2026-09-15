import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeLocalTempoSegments,
  buildScoreDraftFromLocalTempoEvidence,
  createLocalTempoTimingMap,
} from '../src/index.js';

const rubatoEvidence = {
  sourceAuthority: 'SHADOW_EVIDENCE_ONLY',
  providerId: 'rubato-test-provider',
  sourceId: 'audio:rubato-test',
  admittedBpm: null,
  topCandidate: { bpm: 120, confidence: 0.96 },
  tempoCandidates: [{ bpm: 120, confidence: 0.96 }],
  beatTimesSeconds: [0, 0.5, 1, 1.5, 2, 2.4, 2.8, 3.2, 3.6, 4.0],
};

const context = {
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: true,
};

const rawEvents = [
  { eventId: 'bass', midiPitch: 43, onsetSeconds: 0, offsetSeconds: 3.6, confidence: 0.91 },
  { eventId: 'upper-1', midiPitch: 67, onsetSeconds: 0.5, offsetSeconds: 1.0, confidence: 0.9 },
  { eventId: 'upper-2', midiPitch: 69, onsetSeconds: 2.4, offsetSeconds: 2.8, confidence: 0.9 },
];

const rubatoOptions = {
  windowIntervals: 3,
  stepIntervals: 2,
  minWindowConsistency: 0.5,
  minTempoChangeRelative: 0.08,
  minSegmentBeats: 2,
};

test('local tempo analysis detects stable regional tempo movement without requiring one global constant BPM', () => {
  const result = analyzeLocalTempoSegments(rubatoEvidence, rubatoOptions);
  assert.equal(result.status, 'LOCAL_TEMPO_EVIDENCE_READY');
  assert.deepEqual(result.changeBeatIndices, [0, 4]);
  assert.ok(result.windows.some((window) => window.bpm > 145));
  assert.equal(result.anchor.usable, true);
});

test('local tempo timing map fits detected beat regions with piecewise tempo changes', () => {
  const result = createLocalTempoTimingMap(rubatoEvidence, context, rubatoOptions);
  assert.equal(result.status, 'LOCAL_TEMPO_MAP_READY');
  assert.equal(result.timingMap.tempoChanges.length, 2);
  assert.ok(Math.abs(result.timingMap.tempoChanges[0].bpm - 120) < 1e-9);
  assert.ok(Math.abs(result.timingMap.tempoChanges[1].bpm - 150) < 1e-9);
  assert.deepEqual(result.timingMap.tempoChanges[1].positionQuarter, { numerator: 4, denominator: 1 });
  assert.equal(result.timingMap.tempoChanges[1].sourceAuthority, 'ADMITTED_LOCAL_BEAT_EVIDENCE');
});

test('local tempo evidence can drive a polyphonic ScoreDraft while preserving source seconds', () => {
  const result = buildScoreDraftFromLocalTempoEvidence(rawEvents, rubatoEvidence, context, rubatoOptions);
  assert.equal(result.status, 'LOCAL_TEMPO_DRAFT_READY');
  assert.equal(result.draft.status, 'PASS');
  assert.equal(result.draft.timingMap.tempoChanges.length, 2);
  const bass = result.draft.quantizedEvents.find((event) => event.eventId === 'bass');
  assert.equal(bass.sourceOnsetSeconds, 0);
  assert.equal(bass.sourceDurationSeconds, 3.6);
  assert.equal(result.draft.polyphonyPolicy, 'POLYPHONY_IS_DEFAULT');
});

test('half/double ambiguity does not block drafting; it falls back to a provisional tempo candidate', () => {
  const ambiguous = {
    ...rubatoEvidence,
    beatTimesSeconds: [0, 0.5, 1, 1.5, 2, 2.5],
    topCandidate: { bpm: 120, confidence: 0.82 },
    tempoCandidates: [
      { bpm: 120, confidence: 0.82 },
      { bpm: 60, confidence: 0.79 },
    ],
  };
  const result = buildScoreDraftFromLocalTempoEvidence(rawEvents, ambiguous, context, rubatoOptions);
  assert.equal(result.analysis.anchor.halfDoubleAmbiguity, true);
  assert.equal(result.status, 'PROVISIONAL_TEMPO_DRAFT_READY');
  assert.equal(result.timingAuthority, 'PROVISIONAL_PROVIDER_CANDIDATE');
  assert.ok(result.draft);
  assert.equal(result.draft.timingMap.tempoChanges[0].sourceAuthority, 'PROVISIONAL_PROVIDER_CANDIDATE');
});

test('low-confidence tempo evidence still yields an editable provisional draft instead of a hard block', () => {
  const weak = {
    ...rubatoEvidence,
    topCandidate: { bpm: 108, confidence: 0.4 },
    tempoCandidates: [{ bpm: 108, confidence: 0.4 }],
  };
  const result = buildScoreDraftFromLocalTempoEvidence(rawEvents, weak, context, rubatoOptions);
  assert.equal(result.analysis.status, 'LOCAL_TEMPO_GUIDANCE_ONLY');
  assert.equal(result.status, 'PROVISIONAL_TEMPO_DRAFT_READY');
  assert.ok(result.draft);
});

test('explicit user BPM outranks local provider evidence', () => {
  const result = buildScoreDraftFromLocalTempoEvidence(rawEvents, rubatoEvidence, { ...context, bpm: 96 }, rubatoOptions);
  assert.equal(result.status, 'USER_TEMPO_DRAFT_READY');
  assert.equal(result.timingAuthority, 'USER_SUPPLIED');
  assert.equal(result.draft.context.bpm, 96);
  assert.equal(result.draft.timingMap.tempoChanges.length, 1);
  assert.equal(result.draft.timingMap.tempoChanges[0].sourceAuthority, 'USER_SUPPLIED');
});

test('local tempo analysis is deterministic', () => {
  const first = analyzeLocalTempoSegments(rubatoEvidence, rubatoOptions);
  const second = analyzeLocalTempoSegments(rubatoEvidence, rubatoOptions);
  assert.deepEqual(first, second);
});
