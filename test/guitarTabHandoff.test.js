import test from 'node:test';
import assert from 'node:assert/strict';

import { handoffMusicXmlToOptionalGuitarTab } from '../src/adapters/guitarTabEngine.js';

const SOURCE = '<score-partwise version="4.0"><part-list/><part id="P1"/></score-partwise>';

function fakeEngine(overrides = {}) {
  return {
    preflightMusicXml: () => ({ status: 'WARNING', canProcess: true, issues: [{ code: 'QUALITY_HINT' }] }),
    convertMusicXmlToCanonicalTab: () => ({
      preflight: { status: 'WARNING', canProcess: true, issues: [{ code: 'QUALITY_HINT' }] },
      canonicalTabResult: { requiresTeacherReview: true, noteCount: 1 },
    }),
    serializeCanonicalTabResult: () => '{"tab":true}',
    serializeCanonicalTabResultToAscii: () => 'e|--0--|',
    serializeCanonicalTabResultToMusicXml: () => '<score-partwise version="4.0"/>',
    ...overrides,
  };
}

test('S07 successful conversion preserves source and exposes provisional reviewable TAB', () => {
  const result = handoffMusicXmlToOptionalGuitarTab(fakeEngine(), SOURCE);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'TAB_REVIEW_REQUIRED');
  assert.equal(result.source.musicXml, SOURCE);
  assert.equal(result.source.preserved, true);
  assert.equal(result.canonicalTabResult.noteCount, 1);
  assert.match(result.artifacts.ascii, /--0--/);
  assert.match(result.artifacts.musicXml, /score-partwise/);
});

test('S07 missing TAB engine never invalidates the source score', () => {
  const result = handoffMusicXmlToOptionalGuitarTab(null, SOURCE);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'TAB_UNAVAILABLE');
  assert.equal(result.code, 'GUITAR_TAB_ENGINE_UNAVAILABLE');
  assert.equal(result.source.musicXml, SOURCE);
  assert.equal(result.source.preserved, true);
});

test('S07 blocked TAB preflight remains local to TAB capability', () => {
  const result = handoffMusicXmlToOptionalGuitarTab(fakeEngine({
    preflightMusicXml: () => ({ status: 'BLOCKED', canProcess: false, issues: [{ code: 'UNSUPPORTED_SCORE_PATH' }] }),
  }), SOURCE);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'TAB_UNAVAILABLE');
  assert.equal(result.code, 'GUITAR_TAB_PREFLIGHT_BLOCKED');
  assert.equal(result.source.musicXml, SOURCE);
  assert.equal(result.preflight.canProcess, false);
});

test('S07 one failed artifact serializer does not discard canonical TAB or source score', () => {
  const result = handoffMusicXmlToOptionalGuitarTab(fakeEngine({
    serializeCanonicalTabResultToAscii: () => { throw new Error('ascii failed'); },
  }), SOURCE);
  assert.equal(result.ok, true);
  assert.equal(result.canonicalTabResult.noteCount, 1);
  assert.equal(result.artifacts.ascii, null);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, 'TAB_ARTIFACT_SERIALIZATION_FAILED');
  assert.equal(result.source.musicXml, SOURCE);
});

test('S07 caller may request only the artifacts it needs without narrowing conversion semantics', () => {
  const result = handoffMusicXmlToOptionalGuitarTab(fakeEngine(), SOURCE, {
    includeJson: false,
    includeAscii: false,
    includeMusicXml: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.json, null);
  assert.equal(result.artifacts.ascii, null);
  assert.match(result.artifacts.musicXml, /score-partwise/);
});
