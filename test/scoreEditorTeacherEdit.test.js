import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendScoreEditorTeacherEdit,
  applyScoreEditorTeacherEdit,
  buildScoreDraft,
  createTeacherCorrectionLedger,
  rational,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('mapped Score Editor duration receipt becomes teacher ledger evidence and rebuilds duration', () => {
  const source = buildScoreDraft([
    { eventId: 'n1', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 1 },
  ], context);
  const ledger = createTeacherCorrectionLedger({ ledgerId: 'editor-ledger' });
  const result = applyScoreEditorTeacherEdit(source, ledger, {
    sdkVersion: '1.0.0',
    actionId: 'duration.quarter',
    sourceEventId: 'n1',
    editorTargetId: 'editor:event:1',
    documentId: 'doc:1',
    revisionBefore: 'rev:1',
    revisionAfter: 'rev:2',
    before: rational(2, 1),
    after: rational(1, 1),
    actorId: 'teacher-1',
    correctionId: 'editor-c1',
  });

  assert.equal(result.sourceMapped, true);
  assert.equal(result.ledger.activeCorrections.length, 1);
  assert.equal(result.ledger.activeCorrections[0].dimension, 'DURATION');
  assert.deepEqual(result.correctedDraft.quantizedEvents[0].durationQuarter, rational(1, 1));
  assert.deepEqual(source.quantizedEvents[0].durationQuarter, rational(2, 1));
});

test('unmapped editor target is preserved in ledger and remains non-blocking until source identity exists', () => {
  const source = buildScoreDraft([
    { eventId: 'n1', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.5 },
  ], context);
  const ledger = createTeacherCorrectionLedger({ ledgerId: 'unmapped-ledger' });
  const result = applyScoreEditorTeacherEdit(source, ledger, {
    sdkVersion: '1.0.0',
    actionId: 'duration.half',
    editorTargetId: 'semantic-address:opaque-1',
    before: rational(1, 1),
    after: rational(2, 1),
  });

  assert.equal(result.sourceMapped, false);
  assert.equal(result.ledger.activeCorrections[0].target.kind, 'EDITOR_TARGET');
  assert.equal(result.overlay.appliedCorrections.length, 0);
  assert.equal(result.overlay.unappliedCorrections[0].code, 'TEACHER_OVERLAY_TARGET_NOT_FOUND');
  assert.deepEqual(result.correctedDraft.quantizedEvents[0].durationQuarter, source.quantizedEvents[0].durationQuarter);
});

test('notation keypad actions are recorded without inventing pitch semantics', () => {
  const ledger = createTeacherCorrectionLedger({ ledgerId: 'notation-editor-ledger' });
  const recorded = appendScoreEditorTeacherEdit(ledger, {
    sdkVersion: '1.0.0',
    actionId: 'accidental.flat',
    sourceEventId: 'n1',
    before: 'sharp',
    after: 'flat',
  });

  assert.equal(recorded.receipt.dimension, 'NOTATION_ACCIDENTAL');
  assert.equal(recorded.ledger.activeCorrections[0].category, 'NOTATION');
  assert.equal(recorded.receipt.metadata.actionKnownToSdkV1, true);
});

test('future public SDK action can still be preserved as OTHER evidence instead of globally failing', () => {
  const ledger = createTeacherCorrectionLedger({ ledgerId: 'future-editor-ledger' });
  const recorded = appendScoreEditorTeacherEdit(ledger, {
    sdkVersion: '1.0.0',
    actionId: 'future.expression.custom',
    sourceEventId: 'n1',
    before: null,
    after: { value: 'x' },
  });

  assert.equal(recorded.receipt.dimension, 'EDITOR_ACTION:future.expression.custom');
  assert.equal(recorded.ledger.activeCorrections[0].category, 'OTHER');
  assert.equal(recorded.receipt.metadata.actionKnownToSdkV1, false);
});
