import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScoreDraft,
  createTimingMap,
  elapsedSecondsToQuarterPosition,
  quantizePerformanceWithTimingMap,
  quarterPositionToElapsedSeconds,
  rational,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

function tempoMap() {
  return createTimingMap({
    source: 'PIECEWISE_TEST',
    tempoChanges: [
      { positionQuarter: rational(0, 1), bpm: 120, sourceAuthority: 'TEST' },
      { positionQuarter: rational(4, 1), bpm: 60, sourceAuthority: 'TEST' },
    ],
    meterChanges: [
      { positionQuarter: rational(0, 1), numerator: 4, denominator: 4, sourceAuthority: 'TEST' },
    ],
  });
}

test('quarter position maps to elapsed seconds across tempo boundaries', () => {
  const map = tempoMap();
  assert.equal(quarterPositionToElapsedSeconds(map, rational(0, 1)), 0);
  assert.equal(quarterPositionToElapsedSeconds(map, rational(2, 1)), 1);
  assert.equal(quarterPositionToElapsedSeconds(map, rational(4, 1)), 2);
  assert.equal(quarterPositionToElapsedSeconds(map, rational(5, 1)), 3);
  assert.equal(quarterPositionToElapsedSeconds(map, rational(6, 1)), 4);
});

test('elapsed seconds maps back to the correct piecewise musical position', () => {
  const map = tempoMap();
  assert.equal(elapsedSecondsToQuarterPosition(map, 1), 2);
  assert.equal(elapsedSecondsToQuarterPosition(map, 2), 4);
  assert.equal(elapsedSecondsToQuarterPosition(map, 3), 5);
  assert.equal(elapsedSecondsToQuarterPosition(map, 4), 6);
});

test('piecewise mapping remains inverse at tempo-change boundaries and inside segments', () => {
  const map = tempoMap();
  for (const position of [rational(0, 1), rational(1, 1), rational(7, 2), rational(4, 1), rational(9, 2), rational(6, 1)]) {
    const seconds = quarterPositionToElapsedSeconds(map, position);
    const roundTripQuarter = elapsedSecondsToQuarterPosition(map, seconds);
    assert.ok(Math.abs(roundTripQuarter - position.numerator / position.denominator) < 1e-10);
  }
});

test('note onset and offset are mapped independently across a tempo change', () => {
  const map = tempoMap();
  const events = quantizePerformanceWithTimingMap([
    { eventId: 'cross', midiPitch: 60, onsetSeconds: 1.75, offsetSeconds: 2.5 },
  ], context, map);

  assert.deepEqual(events[0].onsetQuarter, rational(7, 2));
  assert.deepEqual(events[0].durationQuarter, rational(1, 1));
  assert.equal(events[0].sourceOnsetSeconds, 1.75);
  assert.equal(events[0].sourceDurationSeconds, 0.75);
});

test('ScoreDraft accepts multiple tempo segments while retaining one admitted meter segment', () => {
  const map = tempoMap();
  const draft = buildScoreDraft([
    { eventId: 'before', midiPitch: 60, onsetSeconds: 1.5, offsetSeconds: 1.75 },
    { eventId: 'after', midiPitch: 64, onsetSeconds: 3.0, offsetSeconds: 3.5 },
  ], context, { timingMap: map });

  assert.equal(draft.schemaVersion, 'score-draft-v0.6');
  assert.equal(draft.timingMap.tempoChanges.length, 2);
  assert.deepEqual(draft.quantizedEvents[0].onsetQuarter, rational(3, 1));
  assert.deepEqual(draft.quantizedEvents[1].onsetQuarter, rational(5, 1));
});

test('ScoreDraft does not silently project changing meter with the old constant-measure builder', () => {
  const map = createTimingMap({
    tempoChanges: [{ positionQuarter: rational(0, 1), bpm: 120 }],
    meterChanges: [
      { positionQuarter: rational(0, 1), numerator: 4, denominator: 4 },
      { positionQuarter: rational(8, 1), numerator: 3, denominator: 4 },
    ],
  });
  assert.throws(() => buildScoreDraft([], context, { timingMap: map }), /one meter segment/i);
});

test('timing-map origin tempo and meter must match the transcription context', () => {
  const wrongTempo = createTimingMap({
    tempoChanges: [{ positionQuarter: rational(0, 1), bpm: 90 }],
    meterChanges: [{ positionQuarter: rational(0, 1), numerator: 4, denominator: 4 }],
  });
  assert.throws(() => quantizePerformanceWithTimingMap([], context, wrongTempo), /origin BPM must match/i);
});
