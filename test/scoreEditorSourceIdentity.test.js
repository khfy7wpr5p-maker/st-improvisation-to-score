import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScoreDraft,
  resolveScoreEditorSourceIdentity,
  serializeScoreDraftForScoreEditor,
  serializeScoreDraftToMusicXml,
} from '../src/index.js';

const context = Object.freeze({
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
});

test('S06E Score Editor handoff adds per-segment source note ids without changing generic MusicXML', () => {
  const draft = buildScoreDraft([
    { eventId: 'cross-bar', midiPitch: 60, onsetSeconds: 1.5, offsetSeconds: 3.0 },
  ], context);
  const generic = serializeScoreDraftToMusicXml(draft);
  const handoff = serializeScoreDraftForScoreEditor(draft);

  assert.equal(generic.includes('id="sti_n'), false);
  assert.equal(handoff.sourceIdentityManifest.sourceNotes.length, 2);
  assert.match(handoff.musicXml, /<note id="sti_n1">/);
  assert.match(handoff.musicXml, /<note id="sti_n2">/);
  assert.equal(handoff.sourceIdentityManifest.sourceNotes[0].sourceEventId, 'cross-bar');
  assert.equal(handoff.sourceIdentityManifest.sourceNotes[1].sourceEventId, 'cross-bar');
  assert.notEqual(
    handoff.sourceIdentityManifest.sourceNotes[0].segmentId,
    handoff.sourceIdentityManifest.sourceNotes[1].segmentId,
  );
});

test('S06E resolver joins public SDK sourceNoteId mappings back to stable sourceEventId', () => {
  const manifest = Object.freeze({
    sourceNotes: Object.freeze([
      Object.freeze({ sourceNoteId: 'sti_n1', sourceEventId: 'event-7', segmentId: 'seg-7' }),
    ]),
  });
  const address = Object.freeze({ kind: 'note', partId: 'part-1', staffId: 'staff-1', measureId: 'measure-1', voiceId: 'voice-1', eventId: 'event-1', noteId: 'note-1' });
  const sdk = Object.freeze({
    sourceIdentity: Object.freeze({
      listNoteMappings: () => Object.freeze({
        ok: true,
        value: Object.freeze([
          Object.freeze({ sourceNoteId: 'sti_n1', target: Object.freeze({ entityKind: 'note', address }) }),
        ]),
      }),
    }),
  });

  const resolved = resolveScoreEditorSourceIdentity(sdk, manifest, Object.freeze({ documentId: 'doc', revisionId: 'rev' }));
  assert.equal(resolved.ok, true);
  assert.equal(resolved.mappings.length, 1);
  assert.equal(resolved.mappings[0].sourceEventId, 'event-7');
  assert.equal(resolved.mappings[0].target.address.noteId, 'note-1');
  assert.deepEqual(resolved.unresolvedSourceNoteIds, []);
});
