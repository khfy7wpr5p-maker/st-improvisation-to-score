import { ImprovisationToScoreError } from '../contracts.js';

export const GUITAR_EVIDENCE_VERSION = '0.1.0';
export const GUITAR_EVIDENCE_MAX_OBSERVATIONS = 100_000;
export const GUITAR_EVIDENCE_AUTHORITY = 'SHADOW_EVIDENCE_ONLY';

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function boundedString(value, field, max = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail('INVALID_GUITAR_EVIDENCE_CONTRACT', `${field} must be a non-empty bounded string.`, { field });
  }
  return value;
}

function optionalBoundedString(value, field, max = 256) {
  if (value == null) return null;
  return boundedString(value, field, max);
}

function finite(value, field, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    fail('INVALID_GUITAR_EVIDENCE_CONTRACT', `${field} must be finite and within range.`, { field, value });
  }
  return number;
}

function optionalInteger(value, field, { min, max }) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < min || value > max) {
    fail('INVALID_GUITAR_EVIDENCE_CONTRACT', `${field} must be an integer within range when provided.`, { field, value });
  }
  return value;
}

function optionalConfidence(value) {
  if (value == null) return null;
  return finite(value, 'confidence', { min: 0, max: 1 });
}

function normalizeContour(points, index) {
  if (points == null) return Object.freeze([]);
  if (!Array.isArray(points)) fail('INVALID_GUITAR_EVIDENCE_CONTRACT', 'pitchContour must be an array when provided.', { index });
  return Object.freeze(points.map((point, pointIndex) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      fail('INVALID_GUITAR_EVIDENCE_CONTRACT', 'pitchContour points must be objects.', { index, pointIndex });
    }
    return Object.freeze({
      timeSeconds: finite(point.timeSeconds, 'pitchContour.timeSeconds', { min: 0 }),
      midiPitchFloat: finite(point.midiPitchFloat, 'pitchContour.midiPitchFloat', { min: 0, max: 127 }),
      confidence: optionalConfidence(point.confidence),
    });
  }));
}

export function createGuitarEvidenceBatch(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_GUITAR_EVIDENCE_CONTRACT', 'Guitar evidence batch must be a plain object.');
  }
  const providerId = boundedString(input.providerId, 'providerId');
  const observations = input.observations ?? [];
  if (!Array.isArray(observations)) fail('INVALID_GUITAR_EVIDENCE_CONTRACT', 'observations must be an array.');
  if (observations.length > GUITAR_EVIDENCE_MAX_OBSERVATIONS) {
    fail('GUITAR_EVIDENCE_LIMIT_EXCEEDED', 'Learned guitar evidence exceeds the admitted observation limit.', {
      limit: GUITAR_EVIDENCE_MAX_OBSERVATIONS,
      actual: observations.length,
    });
  }

  const ids = new Set();
  const normalized = observations.map((observation, index) => {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
      fail('INVALID_GUITAR_EVIDENCE_CONTRACT', 'Each guitar evidence observation must be an object.', { index });
    }
    const onsetSeconds = finite(observation.onsetSeconds, 'onsetSeconds', { min: 0 });
    const offsetSeconds = finite(observation.offsetSeconds, 'offsetSeconds', { min: onsetSeconds });
    if (offsetSeconds <= onsetSeconds) {
      fail('INVALID_GUITAR_EVIDENCE_CONTRACT', 'offsetSeconds must be greater than onsetSeconds.', { index });
    }
    const evidenceId = observation.evidenceId == null
      ? `${providerId}:${index}`
      : boundedString(observation.evidenceId, 'evidenceId', 512);
    if (ids.has(evidenceId)) fail('DUPLICATE_GUITAR_EVIDENCE_ID', 'evidenceId values must be unique within a batch.', { evidenceId });
    ids.add(evidenceId);

    const midiPitch = optionalInteger(observation.midiPitch, 'midiPitch', { min: 0, max: 127 });
    const stringIndex = optionalInteger(observation.stringIndex, 'stringIndex', { min: 1, max: 6 });
    const fret = optionalInteger(observation.fret, 'fret', { min: 0, max: 36 });
    const pitchContour = normalizeContour(observation.pitchContour, index);
    if (midiPitch === null && pitchContour.length === 0) {
      fail('INVALID_GUITAR_EVIDENCE_CONTRACT', 'Observation requires midiPitch or pitchContour evidence.', { index });
    }

    return Object.freeze({
      evidenceId,
      providerId,
      onsetSeconds,
      offsetSeconds,
      midiPitch,
      stringIndex,
      fret,
      confidence: optionalConfidence(observation.confidence),
      pitchContour,
      technique: optionalBoundedString(observation.technique, 'technique', 64),
      metadata: Object.freeze({ ...(observation.metadata ?? {}) }),
    });
  });

  return Object.freeze({
    schemaVersion: 'guitar-evidence-batch-v0.1',
    evidenceVersion: GUITAR_EVIDENCE_VERSION,
    authority: GUITAR_EVIDENCE_AUTHORITY,
    providerId,
    providerVersion: optionalBoundedString(input.providerVersion, 'providerVersion', 128),
    capabilities: Object.freeze([...(input.capabilities ?? [])].map((item) => boundedString(item, 'capability', 128))),
    observations: Object.freeze(normalized),
    diagnostics: Object.freeze([]),
  });
}
