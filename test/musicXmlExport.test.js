import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScoreDraft,
  createScoreDraftMusicXmlManifest,
  serializeScoreDraftToMusicXml,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('polyphonic draft serializes multiple voices with backup', () => {
  const draft = buildScoreDraft([
    { eventId: 'bass', midiPitch: 48, onsetSeconds: 0, offsetSeconds: 2.0 },
    { eventId: 'upper-1', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 0.75 },
    { eventId: 'upper-2', midiPitch: 65, onsetSeconds: 0.75, offsetSeconds: 1.0 },
  ], context);
  const xml = serializeScoreDraftToMusicXml(draft, { title: 'Polyphonic Test', partName: 'Guitar' });

  assert.match(xml, /<score-partwise version="4\.0">/);
  assert.match(xml, /<work-title>Polyphonic Test<\/work-title>/);
  assert.match(xml, /<part-name>Guitar<\/part-name>/);
  assert.match(xml, /<voice>1<\/voice>/);
  assert.match(xml, /<voice>2<\/voice>/);
  assert.match(xml, /<backup>/);
});

test('same-onset notes serialize as a MusicXML chord', () => {
  const draft = buildScoreDraft([
    { eventId: 'c4', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.5 },
    { eventId: 'e4', midiPitch: 64, onsetSeconds: 0, offsetSeconds: 0.5 },
    { eventId: 'g4', midiPitch: 67, onsetSeconds: 0, offsetSeconds: 0.5 },
  ], context);
  const xml = serializeScoreDraftToMusicXml(draft);

  assert.match(xml, /<chord\/>/);
  assert.match(xml, /<step>C<\/step>/);
  assert.match(xml, /<step>E<\/step>/);
  assert.match(xml, /<step>G<\/step>/);
});

test('cross-measure source note serializes tie start and stop segments', () => {
  const draft = buildScoreDraft([
    { eventId: 'long', midiPitch: 60, onsetSeconds: 1.75, offsetSeconds: 2.25 },
  ], context);
  const xml = serializeScoreDraftToMusicXml(draft);

  assert.match(xml, /<measure number="1">[\s\S]*<tie type="start"\/>/);
  assert.match(xml, /<measure number="2">[\s\S]*<tie type="stop"\/>/);
  assert.match(xml, /<tied type="start"\/>/);
  assert.match(xml, /<tied type="stop"\/>/);
});

test('manifest keeps source event identity across projected segments', () => {
  const draft = buildScoreDraft([
    { eventId: 'long', midiPitch: 60, onsetSeconds: 1.75, offsetSeconds: 2.25 },
  ], context);
  const manifest = createScoreDraftMusicXmlManifest(draft);

  assert.equal(manifest.sourceEvents.length, 1);
  assert.equal(manifest.sourceEvents[0].sourceEventId, 'long');
  assert.equal(manifest.sourceEvents[0].segments.length, 2);
  assert.equal(manifest.sourceEvents[0].segments[0].tieToNext, true);
  assert.equal(manifest.sourceEvents[0].segments[1].tieFromPrevious, true);
});

test('empty draft remains serializable as a full-measure rest', () => {
  const draft = buildScoreDraft([], context);
  const xml = serializeScoreDraftToMusicXml(draft);

  assert.match(xml, /<measure number="1">/);
  assert.match(xml, /<rest\/>/);
});
