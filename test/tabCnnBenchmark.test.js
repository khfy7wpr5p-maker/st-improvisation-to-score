import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const benchmarkScript = fileURLToPath(
  new URL('../scripts/benchmark-tabcnn-provider.mjs', import.meta.url),
);
const fakeCrispAsr = fileURLToPath(
  new URL('../fixtures/provider-host/fake-crispasr.mjs', import.meta.url),
);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'st-tabcnn-benchmark-'));
  const modelPath = join(dir, 'tabcnn-f16.gguf');
  const manifestPath = join(dir, 'tabcnn-f16.json');
  const audioPath = join(dir, 'rights-clean-guitar.wav');
  const basicPitchPath = join(dir, 'basic-pitch-events.json');
  const modelBytes = Buffer.from('deterministic-tabcnn-benchmark-model');

  await writeFile(modelPath, modelBytes);
  await writeFile(audioPath, Buffer.from('rights-clean-benchmark-audio-placeholder'));
  await writeFile(basicPitchPath, JSON.stringify([
    {
      eventId: 'bp:0',
      midiPitch: 41,
      onsetSeconds: 0,
      offsetSeconds: 0.2,
      confidence: 0.9,
      amplitude: 0.8,
      sourceEventId: 'source:0'
    }
  ]));

  await writeFile(manifestPath, JSON.stringify({
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
    expectedSha256: sha256(modelBytes),
    architecture: 'tabcnn',
    tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    openMidiByString: [40, 45, 50, 55, 59, 64],
    authority: 'SHADOW_EVIDENCE_ONLY'
  }));

  return {
    env: {
      ...process.env,
      ST_TABCNN_CRISPASR_BIN: fakeCrispAsr,
      ST_TABCNN_MODEL_PATH: modelPath,
      ST_TABCNN_MANIFEST_PATH: manifestPath,
      ST_TABCNN_BENCHMARK_AUDIO: audioPath,
      ST_TABCNN_BENCHMARK_BASIC_PITCH_JSON: basicPitchPath,
      ST_EXPECTED_TABCNN_MODEL_PATH: modelPath,
      ST_EXPECTED_AUDIO_PATH: audioPath,
    },
    expectedSha256: sha256(modelBytes),
  };
}

function runBenchmark(env) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, [benchmarkScript], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('benchmark reports verified TabCNN evidence without promoting authority', async () => {
  const { env, expectedSha256 } = await setup();
  const run = await runBenchmark(env);

  assert.equal(run.code, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.schemaVersion, 's13-2-tabcnn-benchmark-v0.1');
  assert.equal(report.providerStatus, 'READY');
  assert.equal(report.artifactSha256, expectedSha256);
  assert.ok(Number.isFinite(report.elapsedMs) && report.elapsedMs >= 0);
  assert.equal(report.rawFrameCount, 2);
  assert.equal(report.predictionCount, 4);
  assert.equal(report.supportedBasicPitchEventCount, 1);
  assert.equal(report.unmatchedEvidenceCount, 2);
  assert.match(report.predictionDigestSha256, /^[a-f0-9]{64}$/);
  assert.equal(report.authority, 'SHADOW_EVIDENCE_ONLY');
});

test('same audio/model/runtime tuple has deterministic prediction digest', async () => {
  const { env } = await setup();
  const first = await runBenchmark(env);
  const second = await runBenchmark(env);

  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  const a = JSON.parse(first.stdout);
  const b = JSON.parse(second.stdout);
  assert.equal(a.predictionDigestSha256, b.predictionDigestSha256);
  assert.equal(a.rawFrameCount, b.rawFrameCount);
  assert.equal(a.predictionCount, b.predictionCount);
  assert.equal(a.supportedBasicPitchEventCount, b.supportedBasicPitchEventCount);
});
