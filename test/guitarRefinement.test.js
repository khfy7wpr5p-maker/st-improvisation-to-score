import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASIC_PITCH_GUITAR_FRAME_THRESHOLD,
  BASIC_PITCH_GUITAR_MIN_NOTE_LENGTH_FRAMES,
  BASIC_PITCH_GUITAR_ONSET_THRESHOLD,
  basicPitchGuitarAdmissionProfile,
} from '../src/adapters/basicPitchGuitarProfile.js';
import { refineGuitarDurationsForVoicePressure } from '../src/reconstruction/guitarRefinement.js';

function event(eventId, pitch, onset, duration, amplitude = 0.8) {
  return Object.freeze({
    eventId,
    midiPitch: pitch,
    onsetSeconds: onset,
    offsetSeconds: onset + duration,
    confidence: null,
    amplitude,
    sourceEventId: `src:${eventId}`,
  });
}

test('S12.1 browser guitar profile uses conservative Basic Pitch admission thresholds', () => {
  const profile = basicPitchGuitarAdmissionProfile();
  assert.equal(BASIC_PITCH_GUITAR_ONSET_THRESHOLD, 0.5);
  assert.equal(BASIC_PITCH_GUITAR_FRAME_THRESHOLD, 0.3);
  assert.equal(BASIC_PITCH_GUITAR_MIN_NOTE_LENGTH_FRAMES, 11);
  assert.equal(profile.onsetThreshold, 0.5);
  assert.equal(profile.frameThreshold, 0.3);
  assert.equal(profile.minimumNoteLengthFrames, 11);
});

test('S12.1 caps single-line acoustic ringing before a compatible continuation attack', () => {
  const result = refineGuitarDurationsForVoicePressure([
    event('a', 64, 0, 1.2),
    event('b', 67, 0.5, 0.35),
  ]);
  const first = result.refinedEvents.find((item) => item.eventId === 'a');
  assert.equal(first.offsetSeconds, 0.5);
  assert.equal(result.cappedEventCount, 1);
  assert.ok(result.provenance.find((item) => item.eventId === 'a').reasons.includes('SINGLE_LINE_RESONANCE_CAP'));
});

test('S12.1 preserves register-separated sustained notes as possible independent polyphony', () => {
  const result = refineGuitarDurationsForVoicePressure([
    event('bass', 40, 0, 1.5),
    event('upper', 64, 0.5, 0.35),
  ]);
  const bass = result.refinedEvents.find((item) => item.eventId === 'bass');
  assert.equal(bass.offsetSeconds, 1.5);
  assert.equal(result.cappedEventCount, 0);
});

test('S12.1 does not cap a short non-overlapping continuation', () => {
  const result = refineGuitarDurationsForVoicePressure([
    event('a', 64, 0, 0.3),
    event('b', 65, 0.5, 0.3),
  ]);
  assert.equal(result.cappedEventCount, 0);
});
