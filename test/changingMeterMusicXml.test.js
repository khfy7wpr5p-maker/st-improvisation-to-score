import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScoreDraft,
  createTimingMap,
  rational,
  serializeScoreDraftToMusicXml,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('pickup measure serializes as implicit while preserving the declared meter', () => {
  const draft = buildScoreDraft([
    { eventId: 'pickup-note', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.5 },
    { eventId: 'after-pickup', midiPitch: 62, onsetSeconds: 0.5, offsetSeconds: 1.0 },
  ], context, { pickupLengthQuarter: rational(1, 1) });
  const xml = serializeScoreDraftToMusicXml(draft);

  assert.match(xml, /<measure number="1" implicit="yes">/);
  assert.match(xml, /<beats>4<\/beats>/);
  assert.match(xml, /<beat-type>4<\/beat-type>/);
  assert.match(xml, /<measure number="2">/);
});

test('changing meter serializes a shortened implicit transition measure and a new time signature', () => {
  const timingMap = createTimingMap({
    tempoChanges: [{ positionQuarter: rational(0, 1), bpm: 120, sourceAuthority: 'TEST' }],
    meterChanges: [
      { positionQuarter: rational(0, 1), numerator: 4, denominator: 4, sourceAuthority: 'TEST' },
      { positionQuarter: rational(6, 1), numerator: 3, denominator: 4, sourceAuthority: 'TEST' },
    ],
  });
  const draft = buildScoreDraft([
    { eventId: 'long', midiPitch: 60, onsetSeconds: 2.5, offsetSeconds: 4.5 },
  ], context, { timingMap });
  const xml = serializeScoreDraftToMusicXml(draft);

  assert.match(xml, /<measure number="2" implicit="yes">/);
  assert.match(xml, /<measure number="3">[\s\S]*<beats>3<\/beats>[\s\S]*<beat-type>4<\/beat-type>/);
  assert.match(xml, /<measure number="2" implicit="yes">[\s\S]*<tie type="start"\/>/);
  assert.match(xml, /<measure number="3">[\s\S]*<tie type="stop"\/>/);
});
