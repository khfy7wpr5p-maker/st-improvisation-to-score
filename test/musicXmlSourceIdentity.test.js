import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScoreDraft,
  createScoreDraftEditorMusicXmlPayload,
  createScoreDraftSourceNoteIdentity,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('S06E editor MusicXML carries unique safe note tokens linked to source events', () => {
  const draft = buildScoreDraft([
    { eventId: 'source event with unsafe spaces', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.5 },
    { eventId: 'other/source:event', midiPitch: 64, onsetSeconds: 0, offsetSeconds: 0.5 },
  ], context);
  const payload = createScoreDraftEditorMusicXmlPayload(draft);

  assert.equal(payload.sourceIdentity.status, 'APPLIED');
  assert.equal(payload.sourceIdentity.applied, true);
  assert.deepEqual(payload.manifest.sourceNotes.map((item) => item.sourceNoteId), ['sti_n1', 'sti_n2']);
  assert.deepEqual(payload.manifest.sourceNotes.map((item) => item.sourceEventId), [
    'source event with unsafe spaces',
    'other/source:event',
  ]);
  assert.match(payload.musicXml, /<note id="sti_n1">/);
  assert.match(payload.musicXml, /<note id="sti_n2">[\s\S]*<chord\/>/);
  assert.equal(payload.musicXml.includes('id="source event with unsafe spaces"'), false);
});

test('S06E tied segments get distinct note tokens while retaining one source event identity', () => {
  const draft = buildScoreDraft([
    { eventId: 'long', midiPitch: 60, onsetSeconds: 1.75, offsetSeconds: 2.25 },
  ], context);
  const sourceNotes = createScoreDraftSourceNoteIdentity(draft);
  const payload = createScoreDraftEditorMusicXmlPayload(draft);

  assert.equal(sourceNotes.length, 2);
  assert.deepEqual(sourceNotes.map((item) => item.sourceEventId), ['long', 'long']);
  assert.deepEqual(sourceNotes.map((item) => item.sourceNoteId), ['sti_n1', 'sti_n2']);
  assert.equal(sourceNotes[0].tieToNext, true);
  assert.equal(sourceNotes[1].tieFromPrevious, true);
  assert.match(payload.musicXml, /<measure number="1">[\s\S]*<note id="sti_n1">/);
  assert.match(payload.musicXml, /<measure number="2">[\s\S]*<note id="sti_n2">/);
});

test('S06E empty draft remains usable and source identity is simply not applicable', () => {
  const draft = buildScoreDraft([], context);
  const payload = createScoreDraftEditorMusicXmlPayload(draft);

  assert.equal(payload.sourceIdentity.status, 'NOT_APPLICABLE');
  assert.equal(payload.sourceIdentity.applied, false);
  assert.deepEqual(payload.manifest.sourceNotes, []);
  assert.match(payload.musicXml, /<rest\/>/);
  assert.equal(payload.musicXml.includes('id="sti_'), false);
});
