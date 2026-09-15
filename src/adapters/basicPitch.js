import { ImprovisationToScoreError, createRawPerformanceEvent } from '../contracts.js';
import { buildScoreDraft } from '../scoreDraft.js';

export const BASIC_PITCH_PROVIDER_ID = 'spotify_basic_pitch';
export const BASIC_PITCH_SOURCE_TYPE = 'AUDIO_DERIVED';
export const BASIC_PITCH_SOURCE_AUTHORITY = 'SHADOW_EVIDENCE_ONLY';
export const BASIC_PITCH_EXPECTED_PACKAGE_VERSION = '0.4.0';
export const BASIC_PITCH_ADAPTER_VERSION = '0.1.0';
export const BASIC_PITCH_MAX_NOTE_EVENTS = 100_000;

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function boundedString(value, field, max = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail('INVALID_BASIC_PITCH_CONTRACT', `${field} must be a non-empty bounded string.`, { field });
  }
  return value;
}

function optionalBoundedString(value, field, max = 512) {
  if (value == null) return null;
  return boundedString(value, field, max);
}

function sha256OrNull(value, field) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    fail('INVALID_BASIC_PITCH_CONTRACT', `${field} must be a SHA-256 hex string when present.`, { field });
  }
  return value.toLowerCase();
}

function gitCommitShaOrNull(value, field) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/i.test(value)) {
    fail('INVALID_BASIC_PITCH_CONTRACT', `${field} must be a 40-character Git commit SHA when present.`, { field });
  }
  return value.toLowerCase();
}

function normalizeAmplitude(value, eventId, diagnostics) {
  if (value == null) return null;
  const amplitude = Number(value);
  if (!Number.isFinite(amplitude) || amplitude < 0 || amplitude > 1) {
    diagnostics.push(Object.freeze({
      code: 'BASIC_PITCH_AMPLITUDE_IGNORED',
      message: 'Provider amplitude was outside the repository-owned 0..1 metadata contract and was not promoted.',
      details: Object.freeze({ eventId }),
    }));
    return null;
  }
  return amplitude;
}

export function adaptBasicPitchProviderResult(providerResult) {
  if (providerResult === null || typeof providerResult !== 'object' || Array.isArray(providerResult)) {
    fail('INVALID_BASIC_PITCH_RESULT', 'Basic Pitch provider result must be an object.');
  }
  if (providerResult.ok !== true) {
    fail('BASIC_PITCH_PROVIDER_NOT_SUCCESSFUL', 'A successful Basic Pitch provider result is required.', {
      status: providerResult.status ?? null,
      reason: providerResult.reason ?? null,
    });
  }
  if (providerResult.providerId !== BASIC_PITCH_PROVIDER_ID) {
    fail('BASIC_PITCH_PROVIDER_ID_MISMATCH', 'Unexpected transcription provider.', { providerId: providerResult.providerId ?? null });
  }
  if (providerResult.sourceType !== BASIC_PITCH_SOURCE_TYPE) {
    fail('BASIC_PITCH_SOURCE_TYPE_MISMATCH', 'Basic Pitch input must remain AUDIO_DERIVED.', { sourceType: providerResult.sourceType ?? null });
  }
  if (providerResult.authority !== BASIC_PITCH_SOURCE_AUTHORITY) {
    fail('BASIC_PITCH_AUTHORITY_MISMATCH', 'Basic Pitch provider authority must remain SHADOW_EVIDENCE_ONLY at the source boundary.', {
      authority: providerResult.authority ?? null,
    });
  }

  const sourceId = boundedString(providerResult.sourceId, 'sourceId');
  const audioSha256 = sha256OrNull(providerResult.audioSha256, 'audioSha256');
  const generatedMidiSha256 = sha256OrNull(providerResult.generatedMidiSha256, 'generatedMidiSha256');
  if (!audioSha256 || !generatedMidiSha256) {
    fail('INVALID_BASIC_PITCH_CONTRACT', 'Successful provider output requires audio and generated-MIDI SHA-256 provenance.');
  }
  if (!Array.isArray(providerResult.noteEvents)) fail('INVALID_BASIC_PITCH_CONTRACT', 'noteEvents must be an array.');
  if (providerResult.noteEvents.length > BASIC_PITCH_MAX_NOTE_EVENTS) {
    fail('BASIC_PITCH_EVENT_LIMIT_EXCEEDED', 'Basic Pitch note event count exceeds the admitted adapter limit.', {
      limit: BASIC_PITCH_MAX_NOTE_EVENTS,
      actual: providerResult.noteEvents.length,
    });
  }

  const provider = providerResult.provider ?? {};
  const packageVersion = boundedString(provider.packageVersion, 'provider.packageVersion', 64);
  if (packageVersion !== BASIC_PITCH_EXPECTED_PACKAGE_VERSION) {
    fail('BASIC_PITCH_PACKAGE_VERSION_MISMATCH', 'Basic Pitch package version does not match the admitted adapter contract.', {
      expected: BASIC_PITCH_EXPECTED_PACKAGE_VERSION,
      actual: packageVersion,
    });
  }

  const diagnostics = [];
  const ids = new Set();
  const rawEvents = providerResult.noteEvents.map((event, index) => {
    if (event === null || typeof event !== 'object' || Array.isArray(event)) {
      fail('INVALID_BASIC_PITCH_NOTE_EVENT', 'Basic Pitch note event must be an object.', { index });
    }
    const sourceEventId = boundedString(event.eventId, `noteEvents[${index}].eventId`);
    if (ids.has(sourceEventId)) fail('DUPLICATE_BASIC_PITCH_EVENT_ID', 'Basic Pitch event ids must be unique.', { sourceEventId });
    ids.add(sourceEventId);
    if (!Number.isInteger(event.pitchMidi) || event.pitchMidi < 0 || event.pitchMidi > 127) {
      fail('INVALID_BASIC_PITCH_NOTE_EVENT', 'pitchMidi must be an integer in 0..127.', { index, value: event.pitchMidi });
    }
    if (!Number.isFinite(event.startTimeSeconds) || event.startTimeSeconds < 0 ||
        !Number.isFinite(event.endTimeSeconds) || event.endTimeSeconds <= event.startTimeSeconds) {
      fail('INVALID_BASIC_PITCH_NOTE_EVENT', 'Basic Pitch note timing must be finite with endTimeSeconds > startTimeSeconds.', { index });
    }
    return createRawPerformanceEvent({
      eventId: `bp:${index}:${event.pitchMidi}:${event.startTimeSeconds.toFixed(6)}`,
      midiPitch: event.pitchMidi,
      onsetSeconds: event.startTimeSeconds,
      offsetSeconds: event.endTimeSeconds,
      confidence: null,
      amplitude: normalizeAmplitude(event.amplitude, sourceEventId, diagnostics),
      sourceEventId,
    });
  });

  if (rawEvents.length === 0) {
    diagnostics.push(Object.freeze({
      code: 'EMPTY_TRANSCRIPTION_REQUIRES_REVIEW',
      message: 'Basic Pitch returned no note events. The result is preserved but cannot produce note content.',
      details: Object.freeze({ sourceId }),
    }));
  }

  const provenance = Object.freeze({
    adapterVersion: BASIC_PITCH_ADAPTER_VERSION,
    providerId: BASIC_PITCH_PROVIDER_ID,
    sourceId,
    sourceType: BASIC_PITCH_SOURCE_TYPE,
    sourceAuthority: BASIC_PITCH_SOURCE_AUTHORITY,
    audioFileName: optionalBoundedString(providerResult.audioFileName, 'audioFileName'),
    audioSha256,
    generatedMidiSha256,
    packageVersion,
    freshReadRepositorySha: gitCommitShaOrNull(provider.freshReadRepositorySha, 'provider.freshReadRepositorySha'),
    modelSerialization: optionalBoundedString(provider.modelSerialization, 'provider.modelSerialization'),
    modelSha256: sha256OrNull(provider.modelSha256, 'provider.modelSha256'),
  });

  return Object.freeze({
    schemaVersion: 'transcription-batch-v0.1',
    status: diagnostics.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
    provenance,
    rawEvents: Object.freeze(rawEvents),
    diagnostics: Object.freeze(diagnostics),
  });
}

export function buildScoreDraftFromBasicPitchResult(providerResult, context) {
  const batch = adaptBasicPitchProviderResult(providerResult);
  const draft = buildScoreDraft(batch.rawEvents, context);
  const diagnostics = Object.freeze([...batch.diagnostics, ...draft.diagnostics]);
  return Object.freeze({
    schemaVersion: 'basic-pitch-score-draft-v0.1',
    status: diagnostics.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
    transcription: batch,
    draft,
    diagnostics,
  });
}
