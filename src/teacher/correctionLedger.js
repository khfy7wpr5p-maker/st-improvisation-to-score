import { ImprovisationToScoreError } from '../contracts.js';

export const TEACHER_CORRECTION_LEDGER_VERSION = '0.1.0';
export const TEACHER_CORRECTION_AUTHORITY = 'TEACHER_CONFIRMED';
export const TEACHER_CORRECTION_MAX_ENTRIES = 100_000;
export const TEACHER_CORRECTION_MAX_VALUE_DEPTH = 16;

const KNOWN_CATEGORIES = Object.freeze(['PITCH', 'ONSET', 'DURATION', 'RHYTHM', 'VOICE', 'METER', 'TEMPO', 'NOTATION', 'OTHER']);

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function boundedString(value, field, max = 256) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    fail('INVALID_TEACHER_CORRECTION', `${field} must be a non-empty bounded string.`, { field });
  }
  return value.trim();
}

function cloneValue(value, depth = 0) {
  if (depth > TEACHER_CORRECTION_MAX_VALUE_DEPTH) fail('TEACHER_CORRECTION_VALUE_TOO_DEEP', 'Correction before/after value exceeds the admitted nesting depth.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_TEACHER_CORRECTION_VALUE', 'Correction numeric values must be finite.');
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map((item) => cloneValue(item, depth + 1)));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) fail('INVALID_TEACHER_CORRECTION_VALUE', 'Correction values must be JSON-like plain data.');
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.length > 128) fail('INVALID_TEACHER_CORRECTION_VALUE', 'Correction value keys must be bounded.');
      out[key] = cloneValue(item, depth + 1);
    }
    return Object.freeze(out);
  }
  fail('INVALID_TEACHER_CORRECTION_VALUE', 'Correction values must be JSON-like plain data.');
}

function normalizeTarget(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TEACHER_CORRECTION_TARGET', 'Correction target must be a plain object.');
  return Object.freeze({
    kind: boundedString(input.kind ?? 'SOURCE_EVENT', 'target.kind', 64),
    id: boundedString(input.id, 'target.id', 256),
  });
}

export function teacherCorrectionCategory(dimension) {
  const normalized = boundedString(dimension, 'dimension', 128).toUpperCase();
  if (normalized.includes('PITCH')) return 'PITCH';
  if (normalized.includes('ONSET') || normalized.includes('ATTACK')) return 'ONSET';
  if (normalized.includes('DURATION') || normalized.includes('OFFSET')) return 'DURATION';
  if (normalized.includes('RHYTHM') || normalized.includes('QUANT')) return 'RHYTHM';
  if (normalized.includes('VOICE')) return 'VOICE';
  if (normalized.includes('METER') || normalized.includes('TIME_SIGNATURE')) return 'METER';
  if (normalized.includes('TEMPO') || normalized.includes('BPM')) return 'TEMPO';
  if (normalized.includes('NOTATION') || normalized.includes('SPELL') || normalized.includes('ACCIDENTAL') || normalized.includes('TIE')) return 'NOTATION';
  return 'OTHER';
}

function normalizeCorrection(input, sequence) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TEACHER_CORRECTION', 'Correction must be a plain object.');
  const operation = input.operation ?? 'CORRECT';
  if (!['CORRECT', 'REVERT'].includes(operation)) fail('INVALID_TEACHER_CORRECTION_OPERATION', 'operation must be CORRECT or REVERT.', { operation });
  const correctionId = boundedString(input.correctionId, 'correctionId', 160);
  const actorId = boundedString(input.actorId ?? 'teacher', 'actorId', 160);
  const note = input.note == null ? null : boundedString(input.note, 'note', 1000);
  const recordedAt = input.recordedAt == null ? null : boundedString(input.recordedAt, 'recordedAt', 96);

  if (operation === 'REVERT') {
    return Object.freeze({
      schemaVersion: 'teacher-correction-entry-v0.1',
      correctionId,
      sequence,
      operation,
      authority: TEACHER_CORRECTION_AUTHORITY,
      actorId,
      targetCorrectionId: boundedString(input.targetCorrectionId, 'targetCorrectionId', 160),
      note,
      recordedAt,
    });
  }

  const dimension = boundedString(input.dimension, 'dimension', 128);
  return Object.freeze({
    schemaVersion: 'teacher-correction-entry-v0.1',
    correctionId,
    sequence,
    operation,
    authority: TEACHER_CORRECTION_AUTHORITY,
    actorId,
    target: normalizeTarget(input.target),
    dimension,
    category: teacherCorrectionCategory(dimension),
    before: cloneValue(input.before),
    after: cloneValue(input.after),
    note,
    recordedAt,
    supersedesCorrectionId: input.supersedesCorrectionId == null ? null : boundedString(input.supersedesCorrectionId, 'supersedesCorrectionId', 160),
  });
}

function validateLedgerId(value) {
  return boundedString(value, 'ledgerId', 160);
}

function resolveState(entries) {
  const byId = new Map();
  const active = new Set();
  const reverted = new Set();
  const superseded = new Set();

  for (const entry of entries) {
    if (byId.has(entry.correctionId)) fail('DUPLICATE_TEACHER_CORRECTION_ID', 'correctionId values must be unique.', { correctionId: entry.correctionId });
    byId.set(entry.correctionId, entry);
    if (entry.operation === 'CORRECT') {
      active.add(entry.correctionId);
      if (entry.supersedesCorrectionId !== null) {
        const prior = byId.get(entry.supersedesCorrectionId);
        if (!prior || prior.operation !== 'CORRECT') {
          fail('INVALID_TEACHER_CORRECTION_SUPERSESSION', 'supersedesCorrectionId must reference an earlier correction.', { correctionId: entry.correctionId, supersedesCorrectionId: entry.supersedesCorrectionId });
        }
        active.delete(entry.supersedesCorrectionId);
        superseded.add(entry.supersedesCorrectionId);
      }
      continue;
    }

    const target = byId.get(entry.targetCorrectionId);
    if (!target || target.operation !== 'CORRECT') {
      fail('INVALID_TEACHER_CORRECTION_REVERT', 'REVERT must reference an earlier correction.', { correctionId: entry.correctionId, targetCorrectionId: entry.targetCorrectionId });
    }
    active.delete(entry.targetCorrectionId);
    reverted.add(entry.targetCorrectionId);
  }

  return Object.freeze({ byId, active, reverted, superseded });
}

function ledgerFromEntries({ ledgerId, sourceDraftId, sourceRevision, entries }) {
  if (entries.length > TEACHER_CORRECTION_MAX_ENTRIES) fail('TEACHER_CORRECTION_LIMIT_EXCEEDED', 'Teacher correction ledger exceeds the resource-safety limit.', { limit: TEACHER_CORRECTION_MAX_ENTRIES });
  const state = resolveState(entries);
  const activeCorrections = Object.freeze(entries.filter((entry) => entry.operation === 'CORRECT' && state.active.has(entry.correctionId)));
  return Object.freeze({
    schemaVersion: 'teacher-correction-ledger-v0.1',
    ledgerVersion: TEACHER_CORRECTION_LEDGER_VERSION,
    authority: TEACHER_CORRECTION_AUTHORITY,
    ledgerId,
    sourceDraftId,
    sourceRevision,
    revision: entries.length,
    entries: Object.freeze(entries),
    activeCorrections,
  });
}

export function createTeacherCorrectionLedger(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TEACHER_CORRECTION_LEDGER', 'Ledger input must be a plain object.');
  const ledgerId = validateLedgerId(input.ledgerId ?? 'teacher-ledger');
  const sourceDraftId = input.sourceDraftId == null ? null : boundedString(input.sourceDraftId, 'sourceDraftId', 256);
  const sourceRevision = input.sourceRevision == null ? null : boundedString(String(input.sourceRevision), 'sourceRevision', 128);
  const rawEntries = input.entries ?? [];
  if (!Array.isArray(rawEntries)) fail('INVALID_TEACHER_CORRECTION_LEDGER', 'entries must be an array.');
  const entries = rawEntries.map((entry, index) => normalizeCorrection(entry, index + 1));
  return ledgerFromEntries({ ledgerId, sourceDraftId, sourceRevision, entries });
}

export function appendTeacherCorrection(ledgerInput, correctionInput) {
  const ledger = createTeacherCorrectionLedger(ledgerInput);
  const correction = normalizeCorrection(correctionInput, ledger.entries.length + 1);
  return ledgerFromEntries({
    ledgerId: ledger.ledgerId,
    sourceDraftId: ledger.sourceDraftId,
    sourceRevision: ledger.sourceRevision,
    entries: [...ledger.entries, correction],
  });
}

export function revertTeacherCorrection(ledgerInput, targetCorrectionId, metadata = {}) {
  const ledger = createTeacherCorrectionLedger(ledgerInput);
  const targetId = boundedString(targetCorrectionId, 'targetCorrectionId', 160);
  const target = ledger.activeCorrections.find((entry) => entry.correctionId === targetId);
  if (!target) fail('TEACHER_CORRECTION_NOT_ACTIVE', 'Only an active correction can be reverted.', { targetCorrectionId: targetId });
  const correctionId = metadata.correctionId ?? `revert:${targetId}:${ledger.entries.length + 1}`;
  return appendTeacherCorrection(ledger, {
    correctionId,
    operation: 'REVERT',
    targetCorrectionId: targetId,
    actorId: metadata.actorId ?? target.actorId,
    note: metadata.note ?? null,
    recordedAt: metadata.recordedAt ?? null,
  });
}

export function summarizeTeacherCorrections(ledgerInput) {
  const ledger = createTeacherCorrectionLedger(ledgerInput);
  const byCategory = Object.fromEntries(KNOWN_CATEGORIES.map((category) => [category, 0]));
  for (const entry of ledger.activeCorrections) byCategory[entry.category] += 1;
  return Object.freeze({
    ledgerId: ledger.ledgerId,
    revision: ledger.revision,
    totalEntries: ledger.entries.length,
    activeCorrectionCount: ledger.activeCorrections.length,
    revertEntryCount: ledger.entries.filter((entry) => entry.operation === 'REVERT').length,
    byCategory: Object.freeze(byCategory),
  });
}
