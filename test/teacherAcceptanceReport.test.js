import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTeacherAcceptanceReport,
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

function pipelineResult() {
  return {
    ok: true,
    status: 'PASS',
    fileName: 'improv.mp3',
    providerResult: { provenance: { audioSha256: 'a'.repeat(64) } },
    score: {
      draft: {
        quantizedEvents: [{ eventId: 'n1' }, { eventId: 'n2' }, { eventId: 'n3' }, { eventId: 'n4' }],
        polyphonicProjection: { voiceCount: 2 },
      },
    },
    musicXml: '<score-partwise/>',
    editor: {
      ok: true,
      sourceIdentity: { mappings: [{}, {}, {}, {}] },
    },
    guitarTab: { ok: true, status: 'TAB_READY' },
    capabilities: {
      transcription: true,
      sourceScore: true,
      musicXml: true,
      editor: true,
      guitarTab: true,
    },
  };
}

test('acceptance report waits for teacher evidence instead of inventing quality', () => {
  const report = buildTeacherAcceptanceReport({
    sessionId: 'session-1',
    pipelineResult: pipelineResult(),
  });

  assert.equal(report.reviewState, 'AWAITING_TEACHER_REVIEW');
  assert.equal(report.pipeline.detectedEventCount, 4);
  assert.equal(report.pipeline.voiceCount, 2);
  assert.equal(report.combinedQualityScore, null);
  assert.equal(report.acceptanceThreshold, null);
});

test('category review stays independent and records correction workload', () => {
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'session-2:ledger',
    entries: [
      correction('pitch-1', 'n1', 'PITCH_MIDI', 61, 60),
      correction('onset-1', 'n2', 'ONSET_QUARTER', 1.25, 1),
      correction('meter-1', 'score', 'METER', '4/4', '3/4'),
    ],
  });

  const report = buildTeacherAcceptanceReport({
    sessionId: 'session-2',
    pipelineResult: pipelineResult(),
    ledger,
    reviewedCounts: {
      PITCH: 4,
      ONSET: 4,
      DURATION: 4,
      RHYTHM: 4,
      VOICE: 4,
    },
  });

  assert.equal(report.reviewState, 'TEACHER_REVIEW_RECORDED');
  assert.equal(report.calibration.categories.PITCH.teacherReviewedAccuracy, 0.75);
  assert.equal(report.calibration.categories.ONSET.teacherReviewedAccuracy, 0.75);
  assert.equal(report.calibration.categories.DURATION.teacherReviewedAccuracy, 1);
  assert.equal(report.correctionSummary.byCategory.METER, 1);
  assert.equal(report.workload.activeCorrectionEntryCount, 3);
  assert.equal(report.workload.activeCorrectionEntriesPerDetectedEvent, 0.75);
  assert.equal(report.workload.interpretation, 'WORKLOAD_SIGNAL_NOT_ACCURACY');
});

test('partial teacher review is explicitly in progress', () => {
  const report = buildTeacherAcceptanceReport({
    sessionId: 'session-3',
    detectedEventCount: 10,
    reviewedCounts: { PITCH: 10 },
  });

  assert.equal(report.reviewState, 'TEACHER_REVIEW_IN_PROGRESS');
  assert.equal(report.calibration.categories.PITCH.teacherReviewedAccuracy, 1);
  assert.equal(report.calibration.categories.RHYTHM.teacherReviewedAccuracy, null);
});

test('teacher verdict is descriptive and not restricted to a hardcoded enum', () => {
  const report = buildTeacherAcceptanceReport({
    sessionId: 'session-4',
    teacherVerdict: 'usable after small rhythmic edits',
    teacherNotes: 'Preserve the draft; fix two attacks and one duration.',
  });

  assert.equal(report.teacherVerdict, 'usable after small rhythmic edits');
  assert.equal(report.teacherNotes, 'Preserve the draft; fix two attacks and one duration.');
  assert.equal(report.acceptanceThresholdPolicy, 'TEACHER_DEFINED_NOT_HARDCODED');
});

test('local downstream capability status remains descriptive rather than a score-quality verdict', () => {
  const result = pipelineResult();
  result.guitarTab = { ok: false, status: 'TAB_UNAVAILABLE' };
  result.capabilities.guitarTab = false;

  const report = buildTeacherAcceptanceReport({
    sessionId: 'session-5',
    pipelineResult: result,
  });

  assert.equal(report.pipeline.pipelineStatus, 'PASS');
  assert.equal(report.pipeline.guitarTabStatus, 'TAB_UNAVAILABLE');
  assert.equal(report.reviewState, 'AWAITING_TEACHER_REVIEW');
});
