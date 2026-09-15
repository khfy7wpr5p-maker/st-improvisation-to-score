import test from 'node:test';
import assert from 'node:assert/strict';

import { runUserRecordingAcceptance } from '../src/pipeline/userRecordingAcceptance.js';

const context = Object.freeze({
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
});

function providerResult() {
  return {
    ok: true,
    providerId: 'spotify_basic_pitch',
    sourceId: 'audio:user',
    sourceType: 'AUDIO_DERIVED',
    authority: 'SHADOW_EVIDENCE_ONLY',
    audioFileName: 'user.wav',
    audioSha256: 'a'.repeat(64),
    generatedMidiSha256: 'b'.repeat(64),
    noteEvents: [
      { eventId: 'u1', pitchMidi: 60, startTimeSeconds: 0, endTimeSeconds: 0.5, amplitude: 0.8 },
      { eventId: 'u2', pitchMidi: 64, startTimeSeconds: 0, endTimeSeconds: 0.5, amplitude: 0.7 },
      { eventId: 'u3', pitchMidi: 67, startTimeSeconds: 0.5, endTimeSeconds: 1, amplitude: 0.75 },
    ],
    provider: {
      packageVersion: '0.4.0',
      freshReadRepositorySha: 'f'.repeat(40),
      modelSerialization: 'saved-model',
      modelSha256: 'c'.repeat(64),
    },
  };
}

test('S10B defaults to editor-free score and teacher acceptance output', async () => {
  const result = await runUserRecordingAcceptance({
    audioInput: Buffer.from('fixture'),
    sourceId: 'audio:user',
    fileName: 'user.wav',
    context,
    transcriptionProvider: () => providerResult(),
    instrument: 'guitar',
    durationSeconds: 12.5,
  });

  assert.equal(result.pipeline.ok, true);
  assert.equal(result.pipeline.editor, null);
  assert.equal(result.pipeline.guitarTab, null);
  assert.match(result.pipeline.musicXml, /<score-partwise/);
  assert.equal(result.acceptance.pipeline.detectedEventCount, 3);
  assert.equal(result.acceptance.recording.instrument, 'guitar');
  assert.equal(result.acceptance.reviewState, 'AWAITING_TEACHER_REVIEW');
  assert.equal(result.downstream.scoreEditorRequested, false);
  assert.equal(result.downstream.scoreEditorUsed, false);
});

test('S10B preserves provider failure without requiring Score Editor', async () => {
  const result = await runUserRecordingAcceptance({
    audioInput: Buffer.from('fixture'),
    sourceId: 'audio:user-failed',
    fileName: 'user.wav',
    context,
    transcriptionProvider: () => ({
      ok: false,
      status: 'PROVIDER_UNAVAILABLE',
      reason: 'BASIC_PITCH_PACKAGE_UNAVAILABLE',
      message: 'provider runtime missing',
    }),
  });

  assert.equal(result.pipeline.ok, false);
  assert.equal(result.status, 'TRANSCRIPTION_UNAVAILABLE');
  assert.equal(result.pipeline.editor, null);
  assert.equal(result.acceptance.pipeline.pipelineOk, false);
  assert.equal(result.acceptance.combinedQualityScore, null);
});

test('S10B uses Score Editor only when explicitly requested', async () => {
  const result = await runUserRecordingAcceptance({
    audioInput: Buffer.from('fixture'),
    sourceId: 'audio:user-editor',
    fileName: 'user.wav',
    context,
    transcriptionProvider: () => providerResult(),
    useScoreEditor: true,
    scoreEditorSdk: { version: '0.0.0' },
  });

  assert.equal(result.downstream.scoreEditorRequested, true);
  assert.equal(result.downstream.scoreEditorUsed, true);
  assert.equal(result.pipeline.editor.ok, false);
  assert.equal(result.pipeline.ok, true);
});
