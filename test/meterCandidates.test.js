import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptBeatTempoProviderResult,
  analyzeMeterCandidates,
} from '../src/index.js';

function provider({ beatStrengths = undefined } = {}) {
  return {
    ok: true,
    providerId: 'meter-test-provider',
    sourceId: 'audio:meter-test',
    authority: 'SHADOW_EVIDENCE_ONLY',
    beatTimesSeconds: Array.from({ length: 16 }, (_, index) => index * 0.5),
    ...(beatStrengths === undefined ? {} : { beatStrengths }),
    tempoCandidates: [{ bpm: 120, confidence: 0.97 }],
  };
}

test('beat/tempo adapter preserves optional beat strengths for downstream meter evidence', () => {
  const strengths = [1, 0.2, 0.3, 0.2, 1, 0.2, 0.3, 0.2, 1, 0.2, 0.3, 0.2, 1, 0.2, 0.3, 0.2];
  const evidence = adaptBeatTempoProviderResult(provider({ beatStrengths: strengths }));
  assert.deepEqual(evidence.beatStrengths, strengths);
  assert.throws(() => adaptBeatTempoProviderResult(provider({ beatStrengths: [1, 0.2] })), /one-to-one/i);
});

test('clear four-beat accent cycle ranks 4/4 hint first when denominator is supplied', () => {
  const strengths = [1, 0.15, 0.25, 0.15, 1, 0.15, 0.25, 0.15, 1, 0.15, 0.25, 0.15, 1, 0.15, 0.25, 0.15];
  const evidence = adaptBeatTempoProviderResult(provider({ beatStrengths: strengths }));
  const analysis = analyzeMeterCandidates(evidence, { beatUnitDenominatorHint: 4 });

  assert.equal(analysis.status, 'METER_CANDIDATES_READY');
  assert.equal(analysis.candidates[0].numerator, 4);
  assert.equal(analysis.recommendedMeterHint.numerator, 4);
  assert.equal(analysis.recommendedMeterHint.denominator, 4);
  assert.equal(analysis.recommendedMeterHint.downbeatPhase, 0);
  assert.equal(analysis.meterHintReady, true);
  assert.equal(analysis.contextReady, true);
});

test('clear three-beat accent cycle ranks a three-beat measure hint', () => {
  const beatTimesSeconds = Array.from({ length: 18 }, (_, index) => index * 0.5);
  const strengths = Array.from({ length: 18 }, (_, index) => index % 3 === 0 ? 1 : 0.12);
  const analysis = analyzeMeterCandidates({ beatTimesSeconds, beatStrengths: strengths }, { beatUnitDenominatorHint: 4 });

  assert.equal(analysis.candidates[0].numerator, 3);
  assert.equal(analysis.recommendedMeterHint.beatsPerMeasure, 3);
});

test('missing or flat beat-strength evidence degrades to guidance', () => {
  const withoutStrengths = analyzeMeterCandidates({
    beatTimesSeconds: Array.from({ length: 12 }, (_, index) => index * 0.5),
    beatStrengths: null,
  });
  assert.equal(withoutStrengths.status, 'INSUFFICIENT_ACCENT_EVIDENCE');
  assert.equal(withoutStrengths.guidanceRequired, true);
  assert.ok(withoutStrengths.warnings.some((item) => item.code === 'METER_STRENGTH_EVIDENCE_UNAVAILABLE'));

  const flat = analyzeMeterCandidates({
    beatTimesSeconds: Array.from({ length: 12 }, (_, index) => index * 0.5),
    beatStrengths: Array(12).fill(0.5),
  });
  assert.equal(flat.status, 'INSUFFICIENT_ACCENT_EVIDENCE');
  assert.ok(flat.warnings.some((item) => item.code === 'METER_ACCENT_CONTRAST_TOO_LOW'));
});

test('beats-per-measure hint does not invent a denominator', () => {
  const strengths = [1, 0.15, 0.25, 0.15, 1, 0.15, 0.25, 0.15, 1, 0.15, 0.25, 0.15, 1, 0.15, 0.25, 0.15];
  const analysis = analyzeMeterCandidates({
    beatTimesSeconds: Array.from({ length: 16 }, (_, index) => index * 0.5),
    beatStrengths: strengths,
  });

  assert.equal(analysis.recommendedMeterHint.numerator, 4);
  assert.equal(analysis.recommendedMeterHint.denominator, null);
  assert.equal(analysis.contextReady, false);
  assert.equal(analysis.guidanceRequired, true);
  assert.ok(analysis.warnings.some((item) => item.code === 'METER_BEAT_UNIT_UNKNOWN'));
});
