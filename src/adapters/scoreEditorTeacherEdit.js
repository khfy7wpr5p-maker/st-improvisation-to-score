import { ImprovisationToScoreError } from '../contracts.js';
import {
  appendTeacherCorrection,
  createTeacherCorrectionLedger,
} from '../teacher/correctionLedger.js';
import { applyTeacherCorrectionOverlay } from '../teacher/scoreOverlay.js';

export const SCORE_EDITOR_TEACHER_EDIT_BRIDGE_VERSION = '0.1.0';
export const SCORE_EDITOR_TEACHER_EDIT_SDK_VERSION = '1.0.0';

const KNOWN_ACTIONS = new Set([
  'duration.whole',
  'duration.half',
  'duration.quarter',
  'duration.eighth',
  'duration.16th',
  'duration.32nd',
  'rest.whole',
  'rest.half',
  'rest.quarter',
  'rest.eighth',
  'rest.16th',
  'rest.32nd',
  'accidental.flat',
  'accidental.natural',
  'accidental.sharp',
  'dot.set.0',
  'dot.set.1',
  'dot.set.2',
  'dot.set.3',
  'tuplet.triplet',
  'tie.edit',
  'slur.edit',
]);

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function boundedString(value, field, max = 256) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    fail('INVALID_SCORE_EDITOR_TEACHER_EDIT_RECEIPT', `${field} must be a non-empty bounded string.`, { field });
  }
  return value.trim();
}

function dimensionForAction(actionId) {
  if (actionId.startsWith('duration.')) return 'DURATION';
  if (actionId.startsWith('rest.')) return 'RHYTHM_REST';
  if (actionId.startsWith('accidental.')) return 'NOTATION_ACCIDENTAL';
  if (actionId.startsWith('dot.')) return 'NOTATION_DOTS';
  if (actionId === 'tuplet.triplet') return 'RHYTHM_TUPLET';
  if (actionId === 'tie.edit') return 'NOTATION_TIE';
  if (actionId === 'slur.edit') return 'NOTATION_SLUR';
  return `EDITOR_ACTION:${actionId}`;
}

function targetForReceipt(receipt) {
  if (typeof receipt.sourceEventId === 'string' && receipt.sourceEventId.trim()) {
    return Object.freeze({ kind: 'SOURCE_EVENT', id: receipt.sourceEventId.trim() });
  }
  return Object.freeze({
    kind: 'EDITOR_TARGET',
    id: boundedString(receipt.editorTargetId ?? 'unmapped-editor-target', 'editorTargetId', 512),
  });
}

function revisionMetadata(receipt) {
  return Object.freeze({
    sdkVersion: receipt.sdkVersion,
    actionId: receipt.actionId,
    documentId: receipt.documentId ?? null,
    revisionBefore: receipt.revisionBefore ?? null,
    revisionAfter: receipt.revisionAfter ?? null,
    editorTargetId: receipt.editorTargetId ?? null,
    sourceEventId: receipt.sourceEventId ?? null,
    actionKnownToSdkV1: KNOWN_ACTIONS.has(receipt.actionId),
  });
}

function valueWithReceipt(value, dimension, metadata) {
  if (dimension === 'DURATION') return Object.freeze({ durationQuarter: value, editorReceipt: metadata });
  if (dimension.startsWith('RHYTHM')) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return Object.freeze({ ...value, editorReceipt: metadata });
    return Object.freeze({ value, editorReceipt: metadata });
  }
  return Object.freeze({ value, editorReceipt: metadata });
}

export function normalizeScoreEditorTeacherEditReceipt(receiptInput) {
  if (receiptInput === null || typeof receiptInput !== 'object' || Array.isArray(receiptInput)) {
    fail('INVALID_SCORE_EDITOR_TEACHER_EDIT_RECEIPT', 'Score Editor teacher edit receipt must be a plain object.');
  }
  const sdkVersion = boundedString(receiptInput.sdkVersion ?? SCORE_EDITOR_TEACHER_EDIT_SDK_VERSION, 'sdkVersion', 32);
  if (sdkVersion !== SCORE_EDITOR_TEACHER_EDIT_SDK_VERSION) {
    fail('SCORE_EDITOR_TEACHER_EDIT_SDK_VERSION_MISMATCH', 'Teacher edit receipt targets an unsupported Score Editor SDK version.', {
      expected: SCORE_EDITOR_TEACHER_EDIT_SDK_VERSION,
      actual: sdkVersion,
    });
  }
  const actionId = boundedString(receiptInput.actionId, 'actionId', 128);
  const target = targetForReceipt(receiptInput);
  const dimension = dimensionForAction(actionId);
  const metadata = revisionMetadata({ ...receiptInput, sdkVersion, actionId });
  const actorId = typeof receiptInput.actorId === 'string' && receiptInput.actorId.trim()
    ? receiptInput.actorId.trim()
    : 'teacher';

  return Object.freeze({
    schemaVersion: 'score-editor-teacher-edit-receipt-v0.1',
    bridgeVersion: SCORE_EDITOR_TEACHER_EDIT_BRIDGE_VERSION,
    sdkVersion,
    actionId,
    target,
    dimension,
    actorId,
    before: valueWithReceipt(receiptInput.before ?? null, dimension, metadata),
    after: valueWithReceipt(receiptInput.after ?? null, dimension, metadata),
    metadata,
  });
}

export function appendScoreEditorTeacherEdit(ledgerInput, receiptInput, options = {}) {
  const ledger = createTeacherCorrectionLedger(ledgerInput);
  const receipt = normalizeScoreEditorTeacherEditReceipt(receiptInput);
  const correctionId = options.correctionId ?? receiptInput.correctionId ?? `editor:${ledger.revision + 1}:${receipt.target.id}:${receipt.actionId}`;
  const nextLedger = appendTeacherCorrection(ledger, {
    correctionId,
    actorId: receipt.actorId,
    target: receipt.target,
    dimension: receipt.dimension,
    before: receipt.before,
    after: receipt.after,
    note: options.note ?? receiptInput.note ?? `Score Editor ${receipt.actionId}`,
    recordedAt: options.recordedAt ?? receiptInput.recordedAt ?? null,
  });
  return Object.freeze({
    schemaVersion: 'score-editor-teacher-edit-ledger-result-v0.1',
    bridgeVersion: SCORE_EDITOR_TEACHER_EDIT_BRIDGE_VERSION,
    receipt,
    ledger: nextLedger,
    correctionId,
    sourceMapped: receipt.target.kind === 'SOURCE_EVENT',
  });
}

export function applyScoreEditorTeacherEdit(sourceDraft, ledgerInput, receiptInput, options = {}) {
  const recorded = appendScoreEditorTeacherEdit(ledgerInput, receiptInput, options);
  const overlay = applyTeacherCorrectionOverlay(sourceDraft, recorded.ledger, options.overlay ?? {});
  return Object.freeze({
    schemaVersion: 'score-editor-teacher-edit-apply-result-v0.1',
    bridgeVersion: SCORE_EDITOR_TEACHER_EDIT_BRIDGE_VERSION,
    receipt: recorded.receipt,
    ledger: recorded.ledger,
    correctionId: recorded.correctionId,
    sourceMapped: recorded.sourceMapped,
    overlay,
    correctedDraft: overlay.correctedDraft,
  });
}
