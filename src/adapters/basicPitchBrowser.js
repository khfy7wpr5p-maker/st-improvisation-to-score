import { ImprovisationToScoreError, createRawPerformanceEvent } from '../contracts.js';

export const BROWSER_BASIC_PITCH_ADAPTER_VERSION = '0.1.0';
export const BROWSER_BASIC_PITCH_PROVIDER_ID = 'spotify_basic_pitch_ts';
export const BROWSER_BASIC_PITCH_PACKAGE_VERSION = '1.0.1';
export const BROWSER_BASIC_PITCH_SOURCE_AUTHORITY = 'SHADOW_EVIDENCE_ONLY';
export const BROWSER_BASIC_PITCH_MAX_NOTE_EVENTS = 100_000;

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function optionalBoundedString(value, field, max = 1024) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail('INVALID_BROWSER_BASIC_PITCH_CONTRACT', `${field} must be a non-empty bounded string when provided.`, { field });
  }
  return value;
}

function sha256OrNull(value, field) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    fail('INVALID_BROWSER_BASIC_PITCH_CONTRACT', `${field} must be a SHA-256 hex string when provided.`, { field });
  }
  return value.toLowerCase();
}

function amplitudeOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) return null;
  return number;
}

export function adaptBrowserBasicPitchNoteEvents(noteEvents, metadata = {}) {
  if (!Array.isArray(noteEvents)) fail('INVALID_BROWSER_BASIC_PITCH_RESULT', 'noteEvents must be an array.');
  if (noteEvents.length > BROWSER_BASIC_PITCH_MAX_NOTE_EVENTS) {
    fail('BROWSER_BASIC_PITCH_EVENT_LIMIT_EXCEEDED', 'Browser Basic Pitch note event count exceeds the admitted limit.', {
      limit: BROWSER_BASIC_PITCH_MAX_NOTE_EVENTS,
      actual: noteEvents.length,
    });
  }

  const ids = new Set();
  const rawEvents = noteEvents.map((note, index) => {
    if (!note || typeof note !== 'object' || Array.isArray(note)) {
      fail('INVALID_BROWSER_BASIC_PITCH_NOTE_EVENT', 'Browser Basic Pitch note event must be an object.', { index });
    }
    const start = Number(note.startTimeSeconds);
    const duration = Number(note.durationSeconds);
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0) {
      fail('INVALID_BROWSER_BASIC_PITCH_NOTE_EVENT', 'Browser Basic Pitch timing must be finite and positive.', { index });
    }
    if (!Number.isInteger(note.pitchMidi) || note.pitchMidi < 0 || note.pitchMidi > 127) {
      fail('INVALID_BROWSER_BASIC_PITCH_NOTE_EVENT', 'pitchMidi must be an integer in 0..127.', { index, value: note.pitchMidi });
    }

    const sourceEventId = typeof note.eventId === 'string' && note.eventId.length > 0
      ? note.eventId
      : `bpjs:${index}`;
    if (ids.has(sourceEventId)) fail('DUPLICATE_BROWSER_BASIC_PITCH_EVENT_ID', 'Browser Basic Pitch event ids must be unique.', { sourceEventId });
    ids.add(sourceEventId);

    return createRawPerformanceEvent({
      eventId: `bpjs:${index}:${note.pitchMidi}:${start.toFixed(6)}`,
      midiPitch: note.pitchMidi,
      onsetSeconds: start,
      offsetSeconds: start + duration,
      confidence: null,
      amplitude: amplitudeOrNull(note.amplitude),
      sourceEventId,
    });
  });

  const diagnostics = [];
  if (rawEvents.length === 0) {
    diagnostics.push(Object.freeze({
      code: 'EMPTY_BROWSER_TRANSCRIPTION_REQUIRES_REVIEW',
      message: 'Browser Basic Pitch returned no note events.',
      details: Object.freeze({}),
    }));
  }

  return Object.freeze({
    schemaVersion: 'browser-basic-pitch-batch-v0.1',
    adapterVersion: BROWSER_BASIC_PITCH_ADAPTER_VERSION,
    status: diagnostics.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
    provenance: Object.freeze({
      providerId: BROWSER_BASIC_PITCH_PROVIDER_ID,
      packageVersion: BROWSER_BASIC_PITCH_PACKAGE_VERSION,
      sourceAuthority: BROWSER_BASIC_PITCH_SOURCE_AUTHORITY,
      audioFileName: optionalBoundedString(metadata.audioFileName, 'audioFileName', 512),
      audioSha256: sha256OrNull(metadata.audioSha256, 'audioSha256'),
      modelUrl: optionalBoundedString(metadata.modelUrl, 'modelUrl'),
    }),
    rawEvents: Object.freeze(rawEvents),
    diagnostics: Object.freeze(diagnostics),
  });
}
