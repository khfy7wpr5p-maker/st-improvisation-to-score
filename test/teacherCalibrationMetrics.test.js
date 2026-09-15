import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTeacherCalibrationReport,
  createTeacherCorrectionLedger,
} from '../src/index.js';

function correction(correctionId, targetId, dimension, before, after) {
  return {
    correctionId,
    target: { kind: 'SOURCE_EVENT', id: targetId },
    dimension,
    before,
    after,
  };
}

test('calibration report keeps pitch/onset/duration/rhythm/voice independent', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'calibration-core',
    entries: [
      correction('p1', 'n1', 'PITCH_MIDI', 61, 60),
      correction('o1', 'n2', 'ONSET_QUARTER', 1.25, 1),
      correction('d1', 'n3', 'DURATION_QUARTER', 0.75, 1),
      correction('r1', 'n4', 'RHYTHM_GRID', '1/16', 'triplet'),
      correction('v1', 'n5', 'VOICE_ID', 'V2', 'V1'),
    ],
  });

  const report = buildTeacherCalibrationReport({
    ledger,
    reviewedCounts: { PITCH: 10, ONSET: 20, DURATION: 10, RHYTHM: 5, VOICE: 4 },
  });

  assert.equal(report.categories.PITCH.correctionRate, 0.1);
  assert.equal(report.categories.ONSET.correctionRate, 0.05);
  assert.equal(report.categories.DURATION.correctionRate, 0.1);
  assert.equal(report.categories.RHYTHM.correctionRate, 0.2);
  assert.equal(report.categories.VOICE.correctionRate, 0.25);
  assert.equal(report.combinedAccuracy, null);
  assert.equal(report.combinedAccuracyPolicy, 'NOT_REPORTED_BY_DESIGN');
});

test('missing reviewed denominators do not invent an accuracy value', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'no-denominator',
    entries: [correction('p1', 'n1', 'PITCH_MIDI', 63, 62)],
  });
  const report = buildTeacherCalibrationReport({ ledger });
  assert.equal(report.categories.PITCH.denominatorStatus, 'NOT_PROVIDED');
  assert.equal(report.categories.PITCH.correctionRate, null);
  assert.equal(report.categories.PITCH.teacherReviewedAccuracy, null);
});

test('multiple active correction entries on one target do not double-count corrected targets', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'unique-targets',
    entries: [
      correction('p1', 'n1', 'PITCH_MIDI', 61, 60),
      correction('p2', 'n1', 'PITCH_SPELLING', 'C#', 'Db'),
    ],
  });
  const report = buildTeacherCalibrationReport({ ledger, reviewedCounts: { PITCH: 10 } });
  assert.equal(report.categories.PITCH.activeCorrectionEntryCount, 2);
  assert.equal(report.categories.PITCH.correctedTargetCount, 1);
  assert.equal(report.categories.PITCH.correctionRate, 0.1);
});

test('reverted teacher corrections are excluded from active error counts', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'reverted',
    entries: [
      correction('p1', 'n1', 'PITCH_MIDI', 61, 60),
      {
        correctionId: 'revert-p1',
        operation: 'REVERT',
        targetCorrectionId: 'p1',
      },
    ],
  });
  const report = buildTeacherCalibrationReport({ ledger, reviewedCounts: { PITCH: 10 } });
  assert.equal(report.categories.PITCH.correctedTargetCount, 0);
  assert.equal(report.categories.PITCH.correctionRate, 0);
  assert.equal(report.categories.PITCH.teacherReviewedAccuracy, 1);
});

test('inconsistent denominators yield a warning and withhold a misleading rate', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'bad-denominator',
    entries: [
      correction('p1', 'n1', 'PITCH_MIDI', 61, 60),
      correction('p2', 'n2', 'PITCH_MIDI', 64, 65),
    ],
  });
  const report = buildTeacherCalibrationReport({ ledger, reviewedCounts: { PITCH: 1 } });
  assert.equal(report.categories.PITCH.denominatorStatus, 'INCONSISTENT');
  assert.equal(report.categories.PITCH.correctionRate, null);
  assert.ok(report.warnings.some((item) => item.code === 'REVIEW_DENOMINATOR_BELOW_CORRECTED_TARGETS'));
});

test('confidence calibration reports empirical accuracy, Brier score and ECE per category', () => {
  const report = buildTeacherCalibrationReport({
    ledger: createTeacherCorrectionLedger({ ledgerId: 'confidence' }),
    observations: [
      { category: 'PITCH', confidence: 0.9, corrected: false, targetId: 'n1' },
      { category: 'PITCH', confidence: 0.8, corrected: true, targetId: 'n2' },
      { category: 'VOICE', confidence: 0.7, corrected: false, targetId: 'n3' },
    ],
    binCount: 2,
  });

  const pitch = report.categories.PITCH.calibration;
  assert.equal(pitch.observationCount, 2);
  assert.equal(pitch.empiricalAccuracy, 0.5);
  assert.ok(Math.abs(pitch.meanConfidence - 0.85) < 1e-12);
  assert.ok(Math.abs(pitch.brierScore - 0.325) < 1e-12);
  assert.ok(Math.abs(pitch.expectedCalibrationError - 0.35) < 1e-12);
  assert.equal(report.categories.VOICE.calibration.observationCount, 1);
});

test('future uncategorized confidence observations remain visible without contaminating core metrics', () => {
  const report = buildTeacherCalibrationReport({
    ledger: createTeacherCorrectionLedger({ ledgerId: 'future' }),
    observations: [
      { category: 'FINGERING', confidence: 0.6, corrected: true },
      { dimension: 'PITCH_MIDI', confidence: 0.9, corrected: false },
    ],
  });
  assert.equal(report.observationCount, 2);
  assert.equal(report.recognizedObservationCount, 1);
  assert.equal(report.uncategorizedObservationCount, 1);
  assert.equal(report.categories.PITCH.calibration.observationCount, 1);
});
