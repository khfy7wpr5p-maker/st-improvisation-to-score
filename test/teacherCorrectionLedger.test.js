import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendTeacherCorrection,
  createTeacherCorrectionLedger,
  revertTeacherCorrection,
  summarizeTeacherCorrections,
  teacherCorrectionCategory,
} from '../src/index.js';

test('teacher corrections are append-only and preserve before/after evidence', () => {
  let ledger = createTeacherCorrectionLedger({
    ledgerId: 'lesson-1',
    sourceDraftId: 'draft:abc',
    sourceRevision: '7',
  });
  ledger = appendTeacherCorrection(ledger, {
    correctionId: 'c1',
    actorId: 'teacher:1',
    target: { kind: 'SOURCE_EVENT', id: 'note-17' },
    dimension: 'PITCH_MIDI',
    before: 61,
    after: 60,
    note: 'Pitch corrected by ear.',
  });

  assert.equal(ledger.revision, 1);
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.activeCorrections.length, 1);
  assert.equal(ledger.entries[0].authority, 'TEACHER_CONFIRMED');
  assert.equal(ledger.entries[0].category, 'PITCH');
  assert.equal(ledger.entries[0].before, 61);
  assert.equal(ledger.entries[0].after, 60);
});

test('revert appends audit evidence rather than deleting the original correction', () => {
  let ledger = createTeacherCorrectionLedger({ ledgerId: 'lesson-2' });
  ledger = appendTeacherCorrection(ledger, {
    correctionId: 'voice-fix',
    target: { kind: 'PROJECTED_SEGMENT', id: 'n4:S1' },
    dimension: 'VOICE_ID',
    before: 'V2',
    after: 'V1',
  });
  ledger = revertTeacherCorrection(ledger, 'voice-fix', { correctionId: 'undo-voice-fix' });

  assert.equal(ledger.entries.length, 2);
  assert.equal(ledger.entries[0].correctionId, 'voice-fix');
  assert.equal(ledger.entries[1].operation, 'REVERT');
  assert.equal(ledger.entries[1].targetCorrectionId, 'voice-fix');
  assert.equal(ledger.activeCorrections.length, 0);
});

test('new teacher decision can supersede an older decision without erasing history', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'lesson-3',
    entries: [
      {
        correctionId: 'rhythm-1',
        target: { kind: 'SOURCE_EVENT', id: 'n1' },
        dimension: 'RHYTHM_DURATION_QUARTER',
        before: { numerator: 1, denominator: 2 },
        after: { numerator: 1, denominator: 1 },
      },
      {
        correctionId: 'rhythm-2',
        supersedesCorrectionId: 'rhythm-1',
        target: { kind: 'SOURCE_EVENT', id: 'n1' },
        dimension: 'RHYTHM_DURATION_QUARTER',
        before: { numerator: 1, denominator: 1 },
        after: { numerator: 3, denominator: 2 },
      },
    ],
  });

  assert.equal(ledger.entries.length, 2);
  assert.deepEqual(ledger.activeCorrections.map((entry) => entry.correctionId), ['rhythm-2']);
});

test('ledger accepts custom correction dimensions instead of imposing a narrow musical schema', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'lesson-custom',
    entries: [{
      correctionId: 'custom-1',
      target: { kind: 'SCORE', id: 'score:1' },
      dimension: 'CUSTOM_FINGERING_OR_PEDAGOGICAL_MARK',
      before: null,
      after: { label: 'teacher-choice', finger: 3 },
    }],
  });

  assert.equal(ledger.activeCorrections[0].category, 'OTHER');
  assert.deepEqual(ledger.activeCorrections[0].after, { label: 'teacher-choice', finger: 3 });
});

test('missing-event additions can be represented without mutating the source transcription', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'lesson-add',
    entries: [{
      correctionId: 'add-note-1',
      target: { kind: 'SCORE', id: 'score:1' },
      dimension: 'NOTATION_EVENT_ADD',
      before: null,
      after: {
        eventId: 'teacher-added-1',
        midiPitch: 72,
        onsetQuarter: { numerator: 5, denominator: 2 },
        durationQuarter: { numerator: 1, denominator: 2 },
      },
    }],
  });
  assert.equal(ledger.entries[0].category, 'NOTATION');
  assert.equal(ledger.entries[0].target.kind, 'SCORE');
});

test('summary keeps pitch/onset/duration/rhythm/voice metrics separable', () => {
  const dimensions = ['PITCH_MIDI', 'ONSET_QUARTER', 'DURATION_QUARTER', 'RHYTHM_GRID', 'VOICE_ID'];
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'metrics',
    entries: dimensions.map((dimension, index) => ({
      correctionId: `c${index + 1}`,
      target: { kind: 'SOURCE_EVENT', id: `n${index + 1}` },
      dimension,
      before: index,
      after: index + 1,
    })),
  });
  const summary = summarizeTeacherCorrections(ledger);
  assert.equal(summary.byCategory.PITCH, 1);
  assert.equal(summary.byCategory.ONSET, 1);
  assert.equal(summary.byCategory.DURATION, 1);
  assert.equal(summary.byCategory.RHYTHM, 1);
  assert.equal(summary.byCategory.VOICE, 1);
});

test('dimension classifier remains open-ended while recognizing core calibration categories', () => {
  assert.equal(teacherCorrectionCategory('pitch-midi'), 'PITCH');
  assert.equal(teacherCorrectionCategory('attack_onset_seconds'), 'ONSET');
  assert.equal(teacherCorrectionCategory('duration-quarter'), 'DURATION');
  assert.equal(teacherCorrectionCategory('quantization-choice'), 'RHYTHM');
  assert.equal(teacherCorrectionCategory('voice-id'), 'VOICE');
  assert.equal(teacherCorrectionCategory('my-new-future-field'), 'OTHER');
});
