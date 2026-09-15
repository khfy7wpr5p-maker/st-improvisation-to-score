import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptBasicPitchProviderResult,
  buildScoreDraftFromBasicPitchResult,
} from '../src/index.js';

function providerResult(overrides = {}) {
  return {
    ok: true,
    providerId: 'spotify_basic_pitch',
    sourceId: 'improv-001',
    sourceType: 'AUDIO_DERIVED',
    authority: 'SHADOW_EVIDENCE_ONLY',
    audioFileName: 'improv.mp3',
    audioSha256: 'a'.repeat(64),
    generatedMidiSha256: 'b'.repeat(64),
    noteEvents: [
      {
        eventId: 'AUDIO:N0:60:0.000000',
        pitchMidi: 60,
        startTimeSeconds: 0,
        endTimeSeconds: 0.5,
        durationSeconds: 0.5,
        amplitude: 0.8,
        pitchBends: null,
      },
      {
        eventId: 'AUDIO:N1:64:0.000000',
        pitchMidi: 64,
        startTimeSeconds: 0,
        endTimeSeconds: 0.5,
        durationSeconds: 0.5,
        amplitude: 0.7,
        pitchBends: null,
      },
    ],
    provider: {
      packageVersion: '0.4.0',
      freshReadRepositorySha: 'fa5997af0a8210982619003269994a1be25eddf3',
      modelSerialization: 'ICASSP_2022_MODEL_PATH',
      modelSha256: 'c'.repeat(64),
    },
    ...overrides,
  };
}

test('Basic Pitch result maps to repository-owned raw events with provenance', () => {
  const batch = adaptBasicPitchProviderResult(providerResult());
  assert.equal(batch.status, 'PASS');
  assert.equal(batch.rawEvents.length, 2);
  assert.equal(batch.rawEvents[0].midiPitch, 60);
  assert.equal(batch.rawEvents[0].sourceEventId, 'AUDIO:N0:60:0.000000');
  assert.equal(batch.rawEvents[0].confidence, null);
  assert.equal(batch.provenance.audioSha256, 'a'.repeat(64));
  assert.equal(batch.provenance.packageVersion, '0.4.0');
  assert.equal(batch.provenance.freshReadRepositorySha, 'fa5997af0a8210982619003269994a1be25eddf3');
});

test('out-of-range provider amplitude is not promoted into notation metadata', () => {
  const input = providerResult({
    noteEvents: [{
      eventId: 'AUDIO:N0:60:0.000000',
      pitchMidi: 60,
      startTimeSeconds: 0,
      endTimeSeconds: 0.5,
      amplitude: 2,
    }],
  });
  const batch = adaptBasicPitchProviderResult(input);
  assert.equal(batch.status, 'REVIEW_REQUIRED');
  assert.equal(batch.rawEvents[0].amplitude, null);
  assert.ok(batch.diagnostics.some((item) => item.code === 'BASIC_PITCH_AMPLITUDE_IGNORED'));
});

test('adapter rejects failed, wrong-authority and zero-duration provider output', () => {
  assert.throws(() => adaptBasicPitchProviderResult({ ok: false, status: 'PROVIDER_FAILED' }), /successful Basic Pitch/i);
  assert.throws(() => adaptBasicPitchProviderResult(providerResult({ authority: 'TRUSTED_REFERENCE' })), /authority/i);
  assert.throws(() => adaptBasicPitchProviderResult(providerResult({
    noteEvents: [{ eventId: 'zero', pitchMidi: 60, startTimeSeconds: 1, endTimeSeconds: 1, amplitude: 0.5 }],
  })), /timing/i);
});

test('provider result composes through known-tempo score draft without MIDI as authority', () => {
  const result = buildScoreDraftFromBasicPitchResult(providerResult(), {
    bpm: 120,
    meterNumerator: 4,
    meterDenominator: 4,
    smallestNoteDenominator: 16,
    allowTriplets: false,
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.draft.measures[0].events[0].type, 'chord');
  assert.equal(result.draft.measures[0].events[0].notes.length, 2);
  assert.equal(result.transcription.provenance.generatedMidiSha256, 'b'.repeat(64));
  assert.equal('generatedMidiBase64' in result.transcription.provenance, false);
});
