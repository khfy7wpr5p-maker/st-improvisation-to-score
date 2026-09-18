import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runExternalGuitarEvidenceProvider,
  runProviderHostedLearnedGuitarEvidence,
} from '../src/index.js';

const providerScript = fileURLToPath(
  new URL('../scripts/provider-hosts/tabcnn-crispasr-provider.mjs', import.meta.url),
);
const fakeCrispAsr = fileURLToPath(
  new URL('../fixtures/provider-host/fake-crispasr.mjs', import.meta.url),
);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function setup({
  expectedSha256 = null,
  fakeMode = null,
  crispAsrBin = fakeCrispAsr,
  tuning = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  openMidiByString = [40, 45, 50, 55, 59, 64],
} = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'st-tabcnn-host-'));
  const modelPath = join(dir, 'tabcnn-f16.gguf');
  const manifestPath = join(dir, 'tabcnn-f16.json');
  const audioPath = join(dir, 'guitar.wav');
  const modelBytes = Buffer.from('deterministic-tabcnn-provider-model');
  await writeFile(modelPath, modelBytes);
  await writeFile(audioPath, Buffer.from('rights-clean-test-audio-placeholder'));

  const manifest = {
    schemaVersion: 'st-model-artifact-manifest-v0.1',
    providerId: 'tabcnn',
    runtime: 'crispasr',
    runtimeRepository: 'CrispStrobe/CrispASR',
    runtimeCommit: 'e4b59c9fb97a155da91395862e2fa26f77f1c7c7',
    modelRepository: 'cstr/tabcnn-GGUF',
    modelFilename: 'tabcnn-f16.gguf',
    license: 'CC-BY-4.0',
    sourceRecord: 'https://zenodo.org/records/11406378',
    sourceArtifactSha256: '1470a308896629352a811082843eb708cbc2f1aa3092757340055ef76a53ed0c',
    expectedSha256: expectedSha256 ?? sha256(modelBytes),
    architecture: 'tabcnn',
    tuning,
    openMidiByString,
    authority: 'SHADOW_EVIDENCE_ONLY',
  };
  await writeFile(manifestPath, JSON.stringify(manifest));

  const env = {
    ST_TABCNN_CRISPASR_BIN: crispAsrBin,
    ST_TABCNN_MODEL_PATH: modelPath,
    ST_TABCNN_MANIFEST_PATH: manifestPath,
    ST_EXPECTED_TABCNN_MODEL_PATH: modelPath,
    ST_EXPECTED_AUDIO_PATH: audioPath,
    ...(fakeMode ? { ST_FAKE_CRISPASR_MODE: fakeMode } : {}),
  };

  return { dir, modelPath, manifestPath, audioPath, env };
}

test('verified model runs through CrispASR and returns normalized shadow evidence', async () => {
  const { audioPath, env } = await setup();

  const result = await runExternalGuitarEvidenceProvider({
    providerId: 'tabcnn',
    audioPath,
    command: process.execPath,
    args: [providerScript],
    env,
  });

  assert.equal(result.status, 'READY');
  assert.equal(result.providerId, 'tabcnn');
  assert.equal(result.payload.artifact.status, 'VERIFIED');
  assert.match(result.payload.artifact.actualSha256, /^[a-f0-9]{64}$/);
  assert.ok(result.payload.predictions.length > 0);
  assert.ok(Array.isArray(result.payload.rawFrames));
});

test('provider host derives projected pitches from the validated manifest tuning', async () => {
  const { audioPath, env } = await setup({
    tuning: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'],
    openMidiByString: [38, 43, 48, 53, 57, 62],
  });

  const result = await runExternalGuitarEvidenceProvider({
    providerId: 'tabcnn',
    audioPath,
    command: process.execPath,
    args: [providerScript],
    env,
  });

  assert.equal(result.status, 'READY');
  assert.equal(result.payload.predictions[0].midiPitch, 39);
  assert.deepEqual(result.payload.artifact.openMidiByString, [38, 43, 48, 53, 57, 62]);
});

test('hash mismatch cannot become READY', async () => {
  const { audioPath, env } = await setup({ expectedSha256: '0'.repeat(64) });

  const result = await runExternalGuitarEvidenceProvider({
    providerId: 'tabcnn',
    audioPath,
    command: process.execPath,
    args: [providerScript],
    env,
  });

  assert.notEqual(result.status, 'READY');
});

test('missing CrispASR executable cannot become READY', async () => {
  const { audioPath, env } = await setup({ crispAsrBin: '__missing_crispasr_executable__' });

  const result = await runExternalGuitarEvidenceProvider({
    providerId: 'tabcnn',
    audioPath,
    command: process.execPath,
    args: [providerScript],
    env,
  });

  assert.notEqual(result.status, 'READY');
});

test('malformed CrispASR JSON cannot become READY', async () => {
  const { audioPath, env } = await setup({ fakeMode: 'malformed' });

  const result = await runExternalGuitarEvidenceProvider({
    providerId: 'tabcnn',
    audioPath,
    command: process.execPath,
    args: [providerScript],
    env,
  });

  assert.notEqual(result.status, 'READY');
});

test('hosted pipeline preserves Basic Pitch and exposes provider diagnostics', async () => {
  const { audioPath, env } = await setup();
  const event = Object.freeze({
    eventId: 'bp:0',
    midiPitch: 41,
    onsetSeconds: 0,
    offsetSeconds: 0.2,
    confidence: 0.9,
    amplitude: 0.8,
    sourceEventId: 'source:0',
  });
  const snapshot = JSON.stringify(event);

  const result = await runProviderHostedLearnedGuitarEvidence({
    audioPath,
    basicPitchEvents: [event],
    tabCnnHost: {
      command: process.execPath,
      args: [providerScript],
      env,
    },
  });

  assert.equal(JSON.stringify(event), snapshot);
  assert.equal(result.authority, 'SHADOW_EVIDENCE_ONLY');
  assert.equal(result.hostResults[0].status, 'READY');
  assert.equal(result.providerDiagnostics.tabcnn.artifactStatus, 'VERIFIED');
  assert.equal(result.providerDiagnostics.tabcnn.runtimeCommit, 'e4b59c9fb97a155da91395862e2fa26f77f1c7c7');
  assert.deepEqual(result.providerDiagnostics.tabcnn.openMidiByString, [40, 45, 50, 55, 59, 64]);
  assert.ok(result.providerDiagnostics.tabcnn.rawFrameCount > 0);
});
