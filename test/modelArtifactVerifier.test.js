import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  validateModelArtifactManifest,
  verifyModelArtifact,
} from '../src/index.js';

const SOURCE_SHA = '1470a308896629352a811082843eb708cbc2f1aa3092757340055ef76a53ed0c';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function manifest(expectedSha256) {
  return {
    schemaVersion: 'st-model-artifact-manifest-v0.1',
    providerId: 'tabcnn',
    runtime: 'crispasr',
    runtimeRepository: 'CrispStrobe/CrispASR',
    runtimeCommit: 'e4b59c9fb97a155da91395862e2fa26f77f1c7c7',
    modelRepository: 'cstr/tabcnn-GGUF',
    modelFilename: 'tabcnn-f16.gguf',
    license: 'CC-BY-4.0',
    sourceRecord: 'https://zenodo.org/records/11406378',
    sourceArtifactSha256: SOURCE_SHA,
    expectedSha256,
    architecture: 'tabcnn',
    tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    openMidiByString: [40, 45, 50, 55, 59, 64],
    authority: 'SHADOW_EVIDENCE_ONLY',
  };
}

test('validates and freezes a complete shadow-only model manifest', () => {
  const input = manifest('a'.repeat(64));
  const result = validateModelArtifactManifest(input);
  assert.equal(result.authority, 'SHADOW_EVIDENCE_ONLY');
  assert.equal(result.expectedSha256, 'a'.repeat(64));
  assert.deepEqual(result.openMidiByString, [40, 45, 50, 55, 59, 64]);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.tuning));
  assert.ok(Object.isFrozen(result.openMidiByString));
});

test('rejects malformed or non-shadow manifests', () => {
  assert.throws(
    () => validateModelArtifactManifest({ ...manifest('a'.repeat(64)), expectedSha256: 'not-a-hash' }),
    /expectedSha256/,
  );
  assert.throws(
    () => validateModelArtifactManifest({ ...manifest('a'.repeat(64)), authority: 'SOURCE_TRUTH' }),
    /SHADOW_EVIDENCE_ONLY/,
  );
  assert.throws(
    () => validateModelArtifactManifest({ ...manifest('a'.repeat(64)), openMidiByString: [40, 45] }),
    /openMidiByString/,
  );
  assert.throws(
    () => validateModelArtifactManifest({ ...manifest('a'.repeat(64)), tuning: ['E2'] }),
    /tuning/,
  );
  assert.throws(
    () => validateModelArtifactManifest({ ...manifest('a'.repeat(64)), openMidiByString: [41, 45, 50, 55, 59, 64] }),
    /exactly match/,
  );
  assert.throws(
    () => validateModelArtifactManifest({ ...manifest('a'.repeat(64)), runtimeCommit: 'not-a-commit' }),
    /runtimeCommit/,
  );
});

test('keeps the artifact verifier provider-agnostic outside TabCNN', () => {
  const input = {
    ...manifest('a'.repeat(64)),
    providerId: 'fretnet',
  };
  delete input.tuning;
  delete input.openMidiByString;

  const result = validateModelArtifactManifest(input);
  assert.equal(result.providerId, 'fretnet');
  assert.equal(result.tuning, undefined);
  assert.equal(result.openMidiByString, undefined);
});

test('verifies exact model bytes against pinned sha256', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'st-tabcnn-'));
  const artifactPath = join(dir, 'model.gguf');
  const bytes = Buffer.from('deterministic-tabcnn-fixture');
  await writeFile(artifactPath, bytes);

  const result = await verifyModelArtifact({
    manifest: manifest(sha256(bytes)),
    artifactPath,
  });

  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.actualSha256, sha256(bytes));
  assert.equal(result.expectedSha256, sha256(bytes));
});

test('rejects hash mismatch without throwing score-blocking errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'st-tabcnn-'));
  const artifactPath = join(dir, 'model.gguf');
  await writeFile(artifactPath, Buffer.from('wrong-bytes'));

  const result = await verifyModelArtifact({
    manifest: manifest('0'.repeat(64)),
    artifactPath,
  });

  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'SHA256_MISMATCH');
  assert.match(result.actualSha256, /^[a-f0-9]{64}$/);
});

test('reports a missing model as unavailable without throwing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'st-tabcnn-'));
  const artifactPath = join(dir, 'missing.gguf');

  const result = await verifyModelArtifact({
    manifest: manifest('0'.repeat(64)),
    artifactPath,
  });

  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason, 'MODEL_FILE_NOT_FOUND');
});
