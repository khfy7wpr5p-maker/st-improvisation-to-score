import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMeasureTopology,
  buildScoreDraft,
  createTimingMap,
  describeMeasureTopology,
  measureAtQuarter,
  rational,
} from '../src/index.js';

function timingMapWithMeterChange() {
  return createTimingMap({
    source: 'MEASURE_TOPOLOGY_TEST',
    tempoChanges: [
      { positionQuarter: rational(0, 1), bpm: 120, sourceAuthority: 'TEST' },
    ],
    meterChanges: [
      { positionQuarter: rational(0, 1), numerator: 4, denominator: 4, sourceAuthority: 'TEST' },
      { positionQuarter: rational(6, 1), numerator: 3, denominator: 4, sourceAuthority: 'TEST' },
    ],
  });
}

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('meter change inside a nominal bar becomes a reversible shortened transition measure', () => {
  const topology = buildMeasureTopology(timingMapWithMeterChange(), rational(11, 1));
  assert.equal(topology.measureCount, 4);
  assert.deepEqual(topology.measures.map((measure) => measure.lengthQuarter), [
    rational(4, 1),
    rational(2, 1),
    rational(3, 1),
    rational(3, 1),
  ]);
  assert.equal(topology.measures[1].boundaryReason, 'METER_CHANGE_TRUNCATION');
  assert.equal(topology.measures[1].implicit, true);
  assert.equal(topology.measures[2].meterNumerator, 3);
  assert.equal(topology.measures[2].meterChangeAtStart, true);
  assert.equal(measureAtQuarter(topology, rational(6, 1)).measureIndex, 2);
});

test('explicit pickup produces a short implicit first measure without changing later full-bar length', () => {
  const map = createTimingMap({
    tempoChanges: [{ positionQuarter: rational(0, 1), bpm: 120 }],
    meterChanges: [{ positionQuarter: rational(0, 1), numerator: 4, denominator: 4 }],
  });
  const topology = buildMeasureTopology(map, rational(5, 1), { pickupLengthQuarter: rational(1, 1) });
  assert.deepEqual(topology.measures[0].lengthQuarter, rational(1, 1));
  assert.equal(topology.measures[0].isPickup, true);
  assert.equal(topology.measures[0].implicit, true);
  assert.deepEqual(topology.measures[1].startQuarter, rational(1, 1));
  assert.deepEqual(topology.measures[1].lengthQuarter, rational(4, 1));
  assert.deepEqual(describeMeasureTopology(topology), {
    measureCount: 2,
    pickupMeasureCount: 1,
    implicitMeasureCount: 1,
    meterChangeMeasureCount: 1,
    endQuarter: 5,
  });
});

test('non-short pickup request is ignored with a warning rather than blocking the score', () => {
  const map = createTimingMap({
    tempoChanges: [{ positionQuarter: rational(0, 1), bpm: 120 }],
    meterChanges: [{ positionQuarter: rational(0, 1), numerator: 4, denominator: 4 }],
  });
  const topology = buildMeasureTopology(map, rational(2, 1), { pickupLengthQuarter: rational(4, 1) });
  assert.equal(topology.measures[0].isPickup, false);
  assert.deepEqual(topology.measures[0].lengthQuarter, rational(4, 1));
  assert.ok(topology.warnings.some((item) => item.code === 'PICKUP_NOT_SHORTER_THAN_MEASURE_IGNORED'));
});

test('ScoreDraft accepts changing meter and splits sustained notes at variable measure boundaries', () => {
  const draft = buildScoreDraft([
    { eventId: 'cross-change', midiPitch: 60, onsetSeconds: 2.5, offsetSeconds: 3.5 },
  ], context, { timingMap: timingMapWithMeterChange() });

  assert.equal(draft.status, 'PASS');
  assert.equal(draft.measureTopology.measures.length, 3);
  assert.deepEqual(draft.measureTopology.measures.map((measure) => measure.lengthQuarter), [
    rational(4, 1), rational(2, 1), rational(3, 1),
  ]);
  assert.equal(draft.polyphonicProjection.segments.length, 2);
  assert.deepEqual(draft.polyphonicProjection.segments.map((segment) => segment.measureIndex), [1, 2]);
  assert.equal(draft.polyphonicProjection.segments[0].tieToNext, true);
  assert.equal(draft.polyphonicProjection.segments[1].tieFromPrevious, true);
});

test('ScoreDraft pickup option remains fully editable and polyphony-capable', () => {
  const draft = buildScoreDraft([
    { eventId: 'pickup-bass', midiPitch: 48, onsetSeconds: 0, offsetSeconds: 1.0 },
    { eventId: 'pickup-top', midiPitch: 64, onsetSeconds: 0.25, offsetSeconds: 0.5 },
  ], context, { pickupLengthQuarter: rational(1, 1) });

  assert.equal(draft.measureTopology.measures[0].isPickup, true);
  assert.equal(draft.measureTopology.measures[0].implicit, true);
  assert.equal(draft.polyphonyPolicy, 'POLYPHONY_IS_DEFAULT');
  assert.ok(draft.polyphonicProjection.voiceCount >= 1);
  assert.equal(draft.status, 'PASS');
});
