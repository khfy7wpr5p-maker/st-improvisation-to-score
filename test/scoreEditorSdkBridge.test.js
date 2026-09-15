import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildScoreDraft,
  exportMusicXmlFromEditor,
  openScoreDraftInEditor,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

function draft() {
  return buildScoreDraft([
    { eventId: 'bass', midiPitch: 48, onsetSeconds: 0, offsetSeconds: 1.0 },
    { eventId: 'upper', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 0.75 },
  ], context);
}

function fakeSdk(overrides = {}) {
  const calls = [];
  const sdk = {
    version: '1.0.0',
    supports: (capability) => capability === 'document',
    getRevisionGuard: () => Object.freeze({ documentId: 'doc-1', revisionId: 'rev-1' }),
    document: {
      openMusicXml: async (musicXml, options) => {
        calls.push({ musicXml, options });
        return Object.freeze({
          ok: true,
          value: Object.freeze({
            version: '1.0.0',
            hasDocument: true,
            documentId: 'doc-1',
            revisionId: 'rev-1',
            title: options?.title ?? null,
          }),
        });
      },
      exportMusicXml: () => Object.freeze({ ok: true, value: '<score-partwise version="4.0"/>\n' }),
    },
    ...overrides,
  };
  return { sdk, calls };
}

test('bridge opens generated MusicXML through public SDK document capability', async () => {
  const { sdk, calls } = fakeSdk();
  const result = await openScoreDraftInEditor(sdk, draft(), { title: 'My Improvisation', partName: 'Guitar' });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'EDITOR_OPENED');
  assert.equal(result.sdkVersion, '1.0.0');
  assert.equal(calls.length, 1);
  assert.match(calls[0].musicXml, /<score-partwise/);
  assert.equal(calls[0].options.title, 'My Improvisation');
  assert.deepEqual(result.revisionGuard, { documentId: 'doc-1', revisionId: 'rev-1' });
  assert.ok(result.manifest.sourceEvents.length > 0);
});

test('missing document capability does not discard generated MusicXML', async () => {
  const { sdk } = fakeSdk({ supports: () => false });
  const result = await openScoreDraftInEditor(sdk, draft());

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SCORE_EDITOR_DOCUMENT_CAPABILITY_UNAVAILABLE');
  assert.match(result.musicXml, /<score-partwise/);
  assert.ok(result.manifest.sourceEvents.length > 0);
});

test('SDK version mismatch degrades locally and preserves MusicXML', async () => {
  const { sdk } = fakeSdk({ version: '2.0.0' });
  const result = await openScoreDraftInEditor(sdk, draft());

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SCORE_EDITOR_SDK_VERSION_MISMATCH');
  assert.match(result.musicXml, /<score-partwise/);
});

test('editor open failure preserves standalone MusicXML', async () => {
  const { sdk } = fakeSdk({
    document: {
      openMusicXml: async () => Object.freeze({
        ok: false,
        error: Object.freeze({ code: 'INVALID_MUSICXML_SEMANTICS', message: 'Rejected by editor' }),
      }),
      exportMusicXml: () => Object.freeze({ ok: false, error: Object.freeze({ code: 'NO_DOCUMENT', message: 'No document' }) }),
    },
  });
  const result = await openScoreDraftInEditor(sdk, draft());

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_MUSICXML_SEMANTICS');
  assert.match(result.musicXml, /<score-partwise/);
});

test('editor export uses only public exportMusicXml operation', () => {
  const { sdk } = fakeSdk();
  const guard = { documentId: 'doc-1', revisionId: 'rev-1' };
  const result = exportMusicXmlFromEditor(sdk, guard);

  assert.equal(result.ok, true);
  assert.equal(result.status, 'EDITOR_MUSICXML_EXPORTED');
  assert.equal(result.musicXml, '<score-partwise version="4.0"/>\n');
  assert.deepEqual(result.revisionGuard, guard);
});
