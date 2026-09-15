import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptBeatTempoProviderResult,
  buildScoreDraftFromBeatTempoProvider,
} from '../src/index.js';

const provider = (overrides = {}) => ({
  ok: true,
  providerId: 'test-beat-tracker',
  sourceId: 'audio:test',
  authority: 'SHADOW_EVIDENCE_ONLY',
  beatTimesSeconds: [0, 0.5, 1.0, 1.5, 2.0, 2.5],
  tempoCandidates: [
    { bpm: 120, confidence: 0.96 },
    { bpm: 60, confidence: 0.40 },
  ],
  ...overrides,
});

const rawEvents = [
  { eventId: 'n1', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.45 },
  { eventId: 'n2', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 0.95 },
  { eventId: 'n3', midiPitch: 67, onsetSeconds: 1.0, offsetSeconds: 1.45 },
];

const context = {
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('stable high-confidence provider evidence admits automatic BPM', () => {
  const evidence = adaptBeatTempoProviderResult(provider());
  assert.equal(evidence.status, 'AUTO_TEMPO_ADMITTED');
  assert.equal(evidence.admittedBpm, 120);
  assert.ok(evidence.statistics.consistency >= 0.99);
  assert.ok(Math.abs(evidence.statistics.observedBpm - 120) < 1e-9);
});

test('admitted provider BPM can build a normal score draft', () => {
  const result = buildScoreDraftFromBeatTempoProvider(rawEvents, provider(), context);
  assert.equal(result.status, 'AUTO_TEMPO_DRAFT_READY');
  assert.equal(result.timingAuthority, 'ADMITTED_BEAT_PROVIDER_EVIDENCE');
  assert.equal(result.admittedBpm, 120);
  assert.equal(result.draft.status, 'PASS');
  assert.equal(result.draft.context.bpm, 120);
});

test('low provider confidence degrades to guidance without blocking or inventing a draft', () => {
  const result = buildScoreDraftFromBeatTempoProvider(rawEvents, provider({
    tempoCandidates: [{ bpm: 120, confidence: 0.55 }],
  }), context);
  assert.equal(result.status, 'TEMPO_GUIDANCE_REQUIRED');
  assert.equal(result.admittedBpm, null);
  assert.equal(result.draft, null);
  assert.ok(result.evidence.warnings.some((item) => item.code === 'BEAT_TEMPO_LOW_PROVIDER_CONFIDENCE'));
});

test('provider BPM must agree with observed beat period', () => {
  const evidence = adaptBeatTempoProviderResult(provider({
    tempoCandidates: [{ bpm: 60, confidence: 0.98 }],
  }));
  assert.equal(evidence.status, 'TEMPO_GUIDANCE_REQUIRED');
  assert.equal(evidence.admittedBpm, null);
  assert.ok(evidence.warnings.some((item) => item.code === 'BEAT_TEMPO_BPM_PERIOD_MISMATCH'));
});

test('near-equal half/double provider candidates are not auto-admitted', () => {
  const evidence = adaptBeatTempoProviderResult(provider({
    tempoCandidates: [
      { bpm: 120, confidence: 0.91 },
      { bpm: 60, confidence: 0.88 },
    ],
  }));
  assert.equal(evidence.status, 'TEMPO_GUIDANCE_REQUIRED');
  assert.equal(evidence.admittedBpm, null);
  assert.ok(evidence.warnings.some((item) => item.code === 'BEAT_TEMPO_HALF_DOUBLE_AMBIGUITY'));
});

test('explicit user BPM outranks automatic provider timing evidence', () => {
  const result = buildScoreDraftFromBeatTempoProvider(rawEvents, provider(), {
    ...context,
    bpm: 90,
  });
  assert.equal(result.status, 'USER_TEMPO_DRAFT_READY');
  assert.equal(result.timingAuthority, 'USER_SUPPLIED');
  assert.equal(result.admittedBpm, 90);
  assert.equal(result.draft.context.bpm, 90);
});

test('malformed beat timelines fail closed at the adapter boundary', () => {
  assert.throws(() => adaptBeatTempoProviderResult(provider({
    beatTimesSeconds: [0, 0.5, 0.4],
  })), /strictly increasing/i);
  assert.throws(() => adaptBeatTempoProviderResult(provider({
    authority: 'CANONICAL',
  })), /SHADOW_EVIDENCE_ONLY/i);
});
