import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanGuitarPerformanceEvents,
  reconstructGuitarDurations,
} from '../src/reconstruction/guitarCleanup.js';

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

test('S12 cleanup preserves raw evidence while suppressing weak/short derived candidates', () => {
  const raw = [
    event('keep', 64, 0, 0.5, 0.8),
    event('short', 67, 0.2, 0.03, 0.7),
    event('weak-short', 71, 0.4, 0.1, 0.05),
  ];
  const snapshot = JSON.stringify(raw);
  const result = cleanGuitarPerformanceEvents(raw);

  assert.equal(JSON.stringify(raw), snapshot);
  assert.equal(result.rawEventCount, 3);
  assert.equal(result.retainedEventCount, 1);
  assert.equal(result.suppressedEventCount, 2);
  assert.equal(result.cleanedEvents[0].eventId, 'keep');
  assert.ok(result.provenance.some((item) =>
    item.eventId === 'short' && item.reasons.includes('VERY_SHORT_CANDIDATE')
  ));
});

test('S12 onset consolidation anchors near-simultaneous chord tones without losing pitches', () => {
  const result = cleanGuitarPerformanceEvents([
    event('c', 60, 0.000, 0.5),
    event('e', 64, 0.018, 0.5),
    event('g', 67, 0.036, 0.5),
  ]);

  assert.equal(result.cleanedEvents.length, 3);
  assert.deepEqual(result.cleanedEvents.map((item) => item.midiPitch), [60, 64, 67]);
  assert.ok(result.cleanedEvents.every((item) => item.onsetSeconds === 0));
  assert.equal(result.attackGroups.length, 1);
  assert.equal(result.attackGroups[0].eventIds.length, 3);
});

test('S12 near-simultaneous duplicate pitch keeps the stronger candidate with provenance', () => {
  const result = cleanGuitarPerformanceEvents([
    event('weak', 64, 0, 0.3, 0.2),
    event('strong', 64, 0.01, 0.4, 0.9),
  ]);

  assert.equal(result.cleanedEvents.length, 1);
  assert.equal(result.cleanedEvents[0].eventId, 'strong');
  assert.ok(result.provenance.some((item) =>
    item.eventId === 'weak' && item.reasons.includes('NEAR_SIMULTANEOUS_DUPLICATE_PITCH')
  ));
});

test('S12 duration reconstruction caps same-pitch re-articulation instead of preserving acoustic overlap', () => {
  const result = reconstructGuitarDurations([
    event('first', 64, 0, 1.4, 0.8),
    event('second', 64, 0.5, 0.4, 0.8),
  ], {
    bpm: 120,
    smallestNoteDenominator: 16,
    allowTriplets: false,
  });

  const first = result.reconstructedEvents.find((item) => item.eventId === 'first');
  assert.equal(first.offsetSeconds, 0.5);
  assert.ok(result.provenance.find((item) => item.eventId === 'first').reasons.includes('REARTICULATION_CAP'));
});

test('S12 chord resonance is shortened at the next compatible attack while register-separated sustain can remain', () => {
  const result = reconstructGuitarDurations([
    event('chord-c', 60, 0, 2.0),
    event('chord-e', 64, 0, 2.0),
    event('chord-g', 67, 0, 2.0),
    event('next-a', 62, 0.5, 0.4),
    event('next-c', 65, 0.5, 0.4),
  ], {
    bpm: 120,
    smallestNoteDenominator: 16,
    allowTriplets: false,
  });

  for (const eventId of ['chord-c', 'chord-e', 'chord-g']) {
    const reconstructed = result.reconstructedEvents.find((item) => item.eventId === eventId);
    assert.equal(reconstructed.offsetSeconds, 0.5);
  }
  assert.ok(result.diagnostics.some((item) => item.code === 'GUITAR_DURATION_RECONSTRUCTION_APPLIED'));
});

test('S12 optional pitch range is non-destructive and only applies when explicitly selected', () => {
  const raw = [
    event('low', 28, 0, 0.5),
    event('mid', 64, 0.5, 0.5),
  ];
  const defaultResult = cleanGuitarPerformanceEvents(raw);
  const rangedResult = cleanGuitarPerformanceEvents(raw, { pitchRange: { minMidi: 40, maxMidi: 88 } });

  assert.equal(defaultResult.cleanedEvents.length, 2);
  assert.equal(rangedResult.cleanedEvents.length, 1);
  assert.equal(rangedResult.cleanedEvents[0].eventId, 'mid');
  assert.equal(rangedResult.rawEvents.length, 2);
});
