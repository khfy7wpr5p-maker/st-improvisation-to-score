import test from 'node:test';
import assert from 'node:assert/strict';

import { runAudioToScorePipeline } from '../src/pipeline/audioToScore.js';

const context = Object.freeze({
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
});

function providerResult(overrides = {}) {
  return {
    ok: true,
    providerId: 'spotify_basic_pitch',
    sourceId: 'audio:test',
    sourceType: 'AUDIO_DERIVED',
    authority: 'SHADOW_EVIDENCE_ONLY',
    audioFileName: 'fixture.mp3',
    audioSha256: 'a'.repeat(64),
    generatedMidiSha256: 'b'.repeat(64),
    noteEvents: [
      { eventId: 'bp:source:1', pitchMidi: 60, startTimeSeconds: 0, endTimeSeconds: 0.5, amplitude: 0.8 },
      { eventId: 'bp:source:2', pitchMidi: 64, startTimeSeconds: 0.5, endTimeSeconds: 1, amplitude: 0.7 },
    ],
    provider: {
      packageVersion: '0.4.0',
      freshReadRepositorySha: 'f'.repeat(40),
      modelSerialization: 'saved-model',
      modelSha256: 'c'.repeat(64),
    },
    ...overrides,
  };
}

function fakeTabRuntime(overrides = {}) {
  return {
    processMusicXmlUpload: () => ({
      status: 'PASS',
      route: 'POLY_V2',
      preflight: { status: 'PASS', canProcess: true, issues: [] },
      canonicalTabResult: { documentType: 'CanonicalTabResult', noteDispositions: [] },
      musicXml: '<score-partwise version="4.0"/>',
      capabilities: { renderScore: true, generateTab: true, export: true },
      artifacts: { provisionalTabAvailable: false, canonicalTabAvailable: true },
      issues: [],
    }),
    ...overrides,
  };
}

test('S08 runs provider -> ScoreDraft -> MusicXML and keeps optional capabilities local', async () => {
  const result = await runAudioToScorePipeline({
    audioInput: Buffer.from('not-read-by-fake-provider'),
    sourceId: 'audio:test',
    fileName: 'fixture.mp3',
    context,
    transcriptionProvider: async () => providerResult(),
    scoreEditorSdk: { version: '0.0.0' },
    guitarTabEngine: fakeTabRuntime(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'PASS');
  assert.equal(result.capabilities.transcription, true);
  assert.equal(result.capabilities.sourceScore, true);
  assert.equal(result.capabilities.musicXml, true);
  assert.equal(result.capabilities.editor, false);
  assert.equal(result.capabilities.guitarTab, true);
  assert.match(result.musicXml, /<score-partwise/);
  assert.equal(result.score.draft.quantizedEvents.length, 2);
  assert.equal(result.editor.ok, false);
  assert.equal(result.editor.code, 'SCORE_EDITOR_SDK_UNAVAILABLE');
  assert.equal(result.guitarTab.ok, true);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].scope, 'editor');
});

test('S08 provider failure stops only before score reconstruction with explicit provenance', async () => {
  const result = await runAudioToScorePipeline({
    audioInput: Buffer.from('x'),
    sourceId: 'audio:failed',
    fileName: 'fixture.mp3',
    context,
    transcriptionProvider: () => ({
      ok: false,
      status: 'PROVIDER_UNAVAILABLE',
      reason: 'PYTHON_EXECUTABLE_UNAVAILABLE',
      message: 'python3 not found',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'TRANSCRIPTION_UNAVAILABLE');
  assert.equal(result.code, 'PYTHON_EXECUTABLE_UNAVAILABLE');
  assert.equal(result.capabilities.sourceScore, false);
  assert.equal(result.musicXml, null);
});

test('S08 TAB runtime block does not invalidate source MusicXML or score status', async () => {
  const result = await runAudioToScorePipeline({
    audioInput: Buffer.from('x'),
    sourceId: 'audio:test',
    fileName: 'fixture.mp3',
    context,
    transcriptionProvider: () => providerResult(),
    guitarTabEngine: fakeTabRuntime({
      processMusicXmlUpload: () => ({
        status: 'BLOCKED',
        route: 'POLY_V2',
        preflight: { status: 'BLOCKED', canProcess: false, issues: [{ code: 'UNPLAYABLE_SOURCE_PITCH' }] },
        canonicalTabResult: null,
        musicXml: null,
        capabilities: { renderScore: false, generateTab: false, export: false },
        artifacts: { provisionalTabAvailable: false, canonicalTabAvailable: false },
        issues: [{ code: 'UNPLAYABLE_SOURCE_PITCH' }],
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'PASS');
  assert.match(result.musicXml, /<score-partwise/);
  assert.equal(result.guitarTab.ok, false);
  assert.equal(result.capabilities.guitarTab, false);
  assert.equal(result.diagnostics[0].scope, 'guitar-tab');
});

test('S08 accepts synchronous or asynchronous transcription providers', async () => {
  const sync = await runAudioToScorePipeline({
    audioInput: Buffer.from('x'), sourceId: 'audio:test', fileName: 'fixture.mp3', context,
    transcriptionProvider: () => providerResult(),
  });
  const asyncResult = await runAudioToScorePipeline({
    audioInput: Buffer.from('x'), sourceId: 'audio:test', fileName: 'fixture.mp3', context,
    transcriptionProvider: async () => providerResult(),
  });
  assert.equal(sync.ok, true);
  assert.equal(asyncResult.ok, true);
  assert.equal(sync.musicXml, asyncResult.musicXml);
});
