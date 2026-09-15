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

test('S11 browser pipeline produces downloadable MusicXML with explicit user BPM', () => {
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
  assert.match(result.musicXml, /<score-partwise/);
  assert.equal(result.diagnostics.some((item) => item.code === 'BROWSER_DEFAULT_METER_REQUIRES_REVIEW'), false);
});

test('S11 auto timing stays non-blocking and exposes provisional warnings', () => {
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
});
