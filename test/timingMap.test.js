import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScoreDraft,
  buildScoreDraftFromBeatTempoProvider,
  createConstantTimingMapFromContext,
  createTimingMap,
  effectiveMeterAtQuarter,
  effectiveTempoAtQuarter,
  rational,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

const rawEvents = [
  { eventId: 'n1', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.45 },
  { eventId: 'n2', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 0.95 },
];

const provider = {
  ok: true,
  providerId: 'timing-map-test-provider',
  sourceId: 'audio:timing-map',
  authority: 'SHADOW_EVIDENCE_ONLY',
  beatTimesSeconds: [0, 0.5, 1, 1.5, 2, 2.5],
  tempoCandidates: [{ bpm: 120, confidence: 0.97 }],
};

test('constant transcription context becomes a provisional origin timing map', () => {
  const map = createConstantTimingMapFromContext(context, {
    source: 'TEST_CONTEXT',
    tempoSourceAuthority: 'USER_SUPPLIED',
    meterSourceAuthority: 'USER_SUPPLIED',
  });

  assert.equal(map.authority, 'PROVISIONAL_TIMING_MAP');
  assert.equal(map.tempoChanges.length, 1);
  assert.deepEqual(map.tempoChanges[0].positionQuarter, rational(0, 1));
  assert.equal(map.tempoChanges[0].bpm, 120);
  assert.equal(map.tempoChanges[0].sourceAuthority, 'USER_SUPPLIED');
  assert.equal(map.meterChanges[0].numerator, 4);
  assert.equal(map.meterChanges[0].denominator, 4);
});

test('effective timing queries use the latest ordered change at or before the target', () => {
  const map = createTimingMap({
    source: 'TEST_MULTI_SEGMENT',
    tempoChanges: [
      { positionQuarter: rational(0, 1), bpm: 120, sourceAuthority: 'TEST' },
      { positionQuarter: rational(4, 1), bpm: 90, sourceAuthority: 'TEST' },
      { positionQuarter: rational(10, 1), bpm: 132, sourceAuthority: 'TEST' },
    ],
    meterChanges: [
      { positionQuarter: rational(0, 1), numerator: 4, denominator: 4, sourceAuthority: 'TEST' },
      { positionQuarter: rational(8, 1), numerator: 3, denominator: 4, sourceAuthority: 'TEST' },
    ],
  });

  assert.equal(effectiveTempoAtQuarter(map, rational(3, 1)).bpm, 120);
  assert.equal(effectiveTempoAtQuarter(map, rational(4, 1)).bpm, 90);
  assert.equal(effectiveTempoAtQuarter(map, rational(12, 1)).bpm, 132);
  assert.equal(effectiveMeterAtQuarter(map, rational(7, 1)).numerator, 4);
  assert.equal(effectiveMeterAtQuarter(map, rational(8, 1)).numerator, 3);
});

test('timing maps fail closed when origin or ordering is invalid', () => {
  assert.throws(() => createTimingMap({
    tempoChanges: [{ positionQuarter: rational(1, 1), bpm: 120 }],
    meterChanges: [{ positionQuarter: rational(0, 1), numerator: 4, denominator: 4 }],
  }), /begin at musical position zero/i);

  assert.throws(() => createTimingMap({
    tempoChanges: [
      { positionQuarter: rational(0, 1), bpm: 120 },
      { positionQuarter: rational(0, 1), bpm: 90 },
    ],
    meterChanges: [{ positionQuarter: rational(0, 1), numerator: 4, denominator: 4 }],
  }), /strictly increasing/i);
});

test('score draft exposes a constant provisional timing map without changing known-tempo behavior', () => {
  const draft = buildScoreDraft(rawEvents, context);
  assert.equal(draft.schemaVersion, 'score-draft-v0.5');
  assert.equal(draft.status, 'PASS');
  assert.equal(draft.context.bpm, 120);
  assert.equal(draft.timingMap.tempoChanges[0].bpm, 120);
  assert.equal(draft.timingMap.meterChanges[0].numerator, 4);
});

test('admitted beat-provider BPM is recorded in the timing-map authority metadata', () => {
  const result = buildScoreDraftFromBeatTempoProvider(rawEvents, provider, {
    meterNumerator: 4,
    meterDenominator: 4,
    smallestNoteDenominator: 16,
    allowTriplets: false,
  });

  assert.equal(result.status, 'AUTO_TEMPO_DRAFT_READY');
  assert.equal(result.draft.timingMap.tempoChanges[0].sourceAuthority, 'ADMITTED_BEAT_PROVIDER_EVIDENCE');
  assert.equal(result.draft.timingMap.source, 'BEAT_TEMPO_TRANSCRIPTION_CONTEXT');
});

test('explicit user BPM remains higher timing-map authority than provider evidence', () => {
  const result = buildScoreDraftFromBeatTempoProvider(rawEvents, provider, {
    ...context,
    bpm: 90,
  });

  assert.equal(result.status, 'USER_TEMPO_DRAFT_READY');
  assert.equal(result.draft.timingMap.tempoChanges[0].bpm, 90);
  assert.equal(result.draft.timingMap.tempoChanges[0].sourceAuthority, 'USER_SUPPLIED');
});
