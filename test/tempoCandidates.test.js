import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeTempoCandidates } from '../src/index.js';

function note(eventId, onsetSeconds, durationSeconds = 0.2, midiPitch = 60) {
  return { eventId, midiPitch, onsetSeconds, offsetSeconds: onsetSeconds + durationSeconds };
}

test('near-simultaneous chord attacks collapse into one tempo attack group', () => {
  const analysis = analyzeTempoCandidates([
    note('c', 0.000, 0.3, 60),
    note('e', 0.020, 0.3, 64),
    note('g', 0.038, 0.3, 67),
    note('next', 0.500, 0.2, 69),
    note('later', 1.000, 0.2, 71),
  ]);

  assert.equal(analysis.attackGroups.length, 3);
  assert.deepEqual(analysis.attackGroups[0].eventIds, ['c', 'e', 'g']);
  assert.equal(analysis.intervalsSeconds.length, 2);
});

test('regular onset evidence ranks a 120 BPM family candidate without granting timing authority', () => {
  const analysis = analyzeTempoCandidates([
    note('a', 0.0),
    note('b', 0.5),
    note('c', 1.0),
    note('d', 1.5),
    note('e', 2.0),
    note('f', 2.5),
  ]);

  assert.equal(analysis.status, 'CANDIDATES_READY');
  assert.ok(analysis.candidates.some((candidate) => candidate.bpm === 120));
  assert.equal(analysis.authority, 'NON_CANONICAL_TIMING_HINT');
  assert.equal(analysis.guidanceRequired, true);
  assert.equal(analysis.ambiguity.halfDouble, true);
  assert.ok(analysis.warnings.some((item) => item.code === 'TEMPO_HALF_DOUBLE_AMBIGUITY'));
});

test('sparse transcription degrades to guidance instead of throwing or inventing BPM', () => {
  const analysis = analyzeTempoCandidates([
    note('a', 0.0),
    note('b', 0.6),
  ]);

  assert.equal(analysis.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(analysis.recommendedBpmHint, null);
  assert.equal(analysis.confidence, 0);
  assert.equal(analysis.guidanceRequired, true);
  assert.ok(analysis.warnings.some((item) => item.code === 'TEMPO_INSUFFICIENT_ATTACKS'));
});

test('mixed rhythm retains a bounded ranked candidate set', () => {
  const analysis = analyzeTempoCandidates([
    note('a', 0.000),
    note('b', 0.500),
    note('c', 0.875),
    note('d', 1.500),
    note('e', 1.750),
    note('f', 2.250),
    note('g', 2.625),
    note('h', 3.250),
    note('i', 3.500),
  ], { maxCandidates: 5 });

  assert.equal(analysis.candidates.length, 5);
  assert.ok(analysis.candidates.every((candidate, index) => candidate.rank === index + 1));
  assert.ok(analysis.candidates.every((candidate) => candidate.bpm >= 40 && candidate.bpm <= 240));
  assert.ok(analysis.candidates.some((candidate) => Math.abs(candidate.bpm - 120) <= 1));
});

test('tempo candidate analysis is deterministic', () => {
  const events = [
    note('a', 0.0),
    note('b', 0.42),
    note('c', 0.83),
    note('d', 1.27),
    note('e', 1.68),
    note('f', 2.10),
  ];
  assert.deepEqual(analyzeTempoCandidates(events), analyzeTempoCandidates(events));
});
