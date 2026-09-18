import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const MODEL_ARTIFACT_VERIFIER_VERSION = '0.2.0';

const REQUIRED_MANIFEST_FIELDS = Object.freeze([
  'schemaVersion',
  'providerId',
  'runtime',
  'modelRepository',
  'modelFilename',
  'license',
  'sourceRecord',
  'sourceArtifactSha256',
  'expectedSha256',
  'architecture',
  'authority',
]);

function sha256Hex(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(`${field} must be lowercase 64-hex.`);
  }
  return value;
}

function normalizeTuning(value) {
  if (!Array.isArray(value) || value.length !== 6 ||
      value.some((entry) => typeof entry !== 'string' || entry.length === 0 || entry.length > 16)) {
    throw new TypeError('tuning must contain exactly six non-empty pitch-name strings.');
  }
  return Object.freeze([...value]);
}

function normalizeOpenMidiByString(value) {
  if (!Array.isArray(value) || value.length !== 6 ||
      value.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 127)) {
    throw new TypeError('openMidiByString must contain exactly six MIDI integers in 0..127.');
  }
  return Object.freeze([...value]);
}

export function validateModelArtifactManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('model artifact manifest must be a plain object.');
  }

  for (const key of REQUIRED_MANIFEST_FIELDS) {
    if (typeof manifest[key] !== 'string' || manifest[key].length === 0) {
      throw new TypeError(`model artifact manifest ${key} must be a non-empty string.`);
    }
  }

  sha256Hex(manifest.sourceArtifactSha256, 'sourceArtifactSha256');
  sha256Hex(manifest.expectedSha256, 'expectedSha256');

  if (manifest.authority !== 'SHADOW_EVIDENCE_ONLY') {
    throw new TypeError('model artifact authority must remain SHADOW_EVIDENCE_ONLY.');
  }

  return Object.freeze({
    ...manifest,
    tuning: normalizeTuning(manifest.tuning),
    openMidiByString: normalizeOpenMidiByString(manifest.openMidiByString),
  });
}

async function sha256File(artifactPath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(artifactPath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function verifyModelArtifact({ manifest, artifactPath } = {}) {
  const pinned = validateModelArtifactManifest(manifest);
  if (typeof artifactPath !== 'string' || artifactPath.length === 0) {
    throw new TypeError('artifactPath must be a non-empty string.');
  }

  try {
    await access(artifactPath);
  } catch {
    return Object.freeze({
      status: 'UNAVAILABLE',
      reason: 'MODEL_FILE_NOT_FOUND',
      artifactPath,
      expectedSha256: pinned.expectedSha256,
    });
  }

  let actualSha256;
  try {
    actualSha256 = await sha256File(artifactPath);
  } catch (error) {
    return Object.freeze({
      status: 'UNAVAILABLE',
      reason: 'MODEL_FILE_UNREADABLE',
      artifactPath,
      expectedSha256: pinned.expectedSha256,
      errorMessage: String(error?.message ?? error),
    });
  }

  if (actualSha256 !== pinned.expectedSha256) {
    return Object.freeze({
      status: 'REJECTED',
      reason: 'SHA256_MISMATCH',
      artifactPath,
      expectedSha256: pinned.expectedSha256,
      actualSha256,
    });
  }

  return Object.freeze({
    status: 'VERIFIED',
    artifactPath,
    expectedSha256: pinned.expectedSha256,
    actualSha256,
  });
}
