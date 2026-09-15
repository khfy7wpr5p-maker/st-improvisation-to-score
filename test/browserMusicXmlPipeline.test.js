import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptBrowserBasicPitchNoteEvents,
  buildBrowserMusicXmlFromBasicPitch,
} from '../src/index.js';

const notes = [
  { startTimeSeconds: 0, durationSeconds: 0.48, pitchMidi: 60, amplitude: 0.8 },
  { startTimeSeconds: 0, durationSeconds: 0.48, pitchMidi: 64, amplitude: 0.75 },
  { startTimeSeconds: 0.5, durationSeconds: 0.48, pitchMidi: 67, amplitude: 0.82 },
  { startTimeSeconds: 1, durationSeconds: 0.5, pitchMidi: 69, amplitude: 0.78 },
];

test('S11 browser adapter converts Basic Pitch TS note times without MIDI as authority', () => {
  const batch = adaptBrowserBasicPitchNoteEvents(notes, {
    audioFileName: 'improv.wav',
    audioSha256: 'a'.repeat(64),
    modelUrl: 'https://example.test/model/model.json',
  });

  assert.equal(batch.status, 'PASS');
  assert.equal(batch.rawEvents.length, 4);
  assert.equal(batch.rawEvents[0].midiPitch, 60);
  assert.equal(batch.rawEvents[0].sourceEventId, 'bpjs:0');
  assert.equal(batch.provenance.providerId, 'spotify_basic_pitch_ts');
  assert.equal(batch.provenance.packageVersion, '1.0.1');
  assert.equal(batch.provenance.audioSha256, 'a'.repeat(64));
});

test('S12 browser pipeline preserves raw count and reports retained musical events with explicit user BPM', () => {
  const result = buildBrowserMusicXmlFromBasicPitch({
    noteEvents: notes,
    audioFileName: 'improv.wav',
    audioSha256: 'b'.repeat(64),
    bpm: 120,
    meterNumerator: 4,
    meterDenominator: 4,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.bpm, 120);
  assert.equal(result.summary.bpmSource, 'USER');
  assert.equal(result.summary.detectedEventCount, 4);
  assert.equal(result.summary.retainedEventCount, 4);
  assert.equal(result.transcription.rawEvents.length, 4);
  assert.equal(result.guitarCleanup.rawEvents.length, 4);
  assert.match(result.musicXml, /<score-partwise/);
  assert.equal(result.diagnostics.some((item) => item.code === 'BROWSER_DEFAULT_METER_REQUIRES_REVIEW'), false);
});

test('S12 auto timing stays non-blocking and exposes conservative half/double alternatives', () => {
  const result = buildBrowserMusicXmlFromBasicPitch({
    noteEvents: notes,
    audioFileName: 'improv.wav',
  });

  assert.equal(result.ok, true);
  assert.match(result.musicXml, /<score-partwise/);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.summary.bpmSource, 'AUTO_PROVISIONAL');
  assert.ok(result.summary.bpm > 0);
  assert.ok(result.diagnostics.some((item) => item.code === 'BROWSER_DEFAULT_METER_REQUIRES_REVIEW'));

  if (result.tempo.ambiguity.halfDouble) {
    assert.ok(result.summary.tempoAlternatives.length > 1);
    assert.equal(result.summary.bpm, Math.min(...result.summary.tempoAlternatives));
    assert.ok(result.diagnostics.some((item) => item.code === 'BROWSER_AUTO_TEMPO_HALF_DOUBLE_PROVISIONAL'));
  }
});

test('S12 low-value browser candidates are removed only from the derived cleanup view', () => {
  const result = buildBrowserMusicXmlFromBasicPitch({
    noteEvents: [
      { startTimeSeconds: 0, durationSeconds: 0.5, pitchMidi: 60, amplitude: 0.8 },
      { startTimeSeconds: 0.5, durationSeconds: 0.03, pitchMidi: 72, amplitude: 0.8 },
      { startTimeSeconds: 1.0, durationSeconds: 0.5, pitchMidi: 64, amplitude: 0.8 },
    ],
    bpm: 120,
    meterNumerator: 4,
    meterDenominator: 4,
  });

  assert.equal(result.summary.detectedEventCount, 3);
  assert.equal(result.summary.retainedEventCount, 2);
  assert.equal(result.transcription.rawEvents.length, 3);
  assert.equal(result.guitarCleanup.suppressedEventCount, 1);
  assert.ok(result.diagnostics.some((item) => item.code === 'GUITAR_CLEANUP_CANDIDATES_SUPPRESSED'));
});

test('S12 repeated notation warnings are grouped deterministically', () => {
  const result = buildBrowserMusicXmlFromBasicPitch({
    noteEvents: [
      { startTimeSeconds: 0, durationSeconds: 0.25, pitchMidi: 60, amplitude: 0.8 },
      { startTimeSeconds: 0, durationSeconds: 0.5, pitchMidi: 64, amplitude: 0.8 },
      { startTimeSeconds: 1, durationSeconds: 0.25, pitchMidi: 62, amplitude: 0.8 },
      { startTimeSeconds: 1, durationSeconds: 0.5, pitchMidi: 65, amplitude: 0.8 },
    ],
    bpm: 120,
    meterNumerator: 4,
    meterDenominator: 4,
    allowTriplets: false,
  });

  const grouped = result.diagnostics.find((item) => item.code === 'MIXED_DURATION_CHORD_SPLIT_HINT_PRESERVED');
  assert.ok(grouped);
  assert.equal(grouped.details.groupedCount, 2);
  assert.match(grouped.message, /2 occurrences/);
});
