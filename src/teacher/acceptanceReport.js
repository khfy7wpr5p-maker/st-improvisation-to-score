import { ImprovisationToScoreError } from '../contracts.js';
import { buildTeacherCalibrationReport } from './calibrationMetrics.js';
import { createTeacherCorrectionLedger, summarizeTeacherCorrections } from './correctionLedger.js';

export const TEACHER_ACCEPTANCE_REPORT_VERSION = '0.1.0';
export const TEACHER_ACCEPTANCE_CORE_CATEGORIES = Object.freeze(['PITCH', 'ONSET', 'DURATION', 'RHYTHM', 'VOICE']);

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function optionalString(value, field, max = 512) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    fail('INVALID_TEACHER_ACCEPTANCE_REPORT', `${field} must be a non-empty bounded string when provided.`, { field });
  }
  return value.trim();
}

function optionalNonNegativeNumber(value, field) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail('INVALID_TEACHER_ACCEPTANCE_REPORT', `${field} must be a finite non-negative number when provided.`, { field, value });
  }
  return value;
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}

function summarizePipeline(pipelineResult) {
  if (pipelineResult == null) return null;
  if (typeof pipelineResult !== 'object' || Array.isArray(pipelineResult)) {
    fail('INVALID_TEACHER_ACCEPTANCE_PIPELINE_RESULT', 'pipelineResult must be a plain object when provided.');
  }

  const draft = pipelineResult.score?.draft ?? null;
  const quantizedEvents = Array.isArray(draft?.quantizedEvents) ? draft.quantizedEvents : null;
  const sourceIdentityMappings = Array.isArray(pipelineResult.editor?.sourceIdentity?.mappings)
    ? pipelineResult.editor.sourceIdentity.mappings
    : null;

  return Object.freeze({
    pipelineStatus: pipelineResult.status ?? null,
    pipelineOk: typeof pipelineResult.ok === 'boolean' ? pipelineResult.ok : null,
    detectedEventCount: quantizedEvents?.length ?? null,
    voiceCount: Number.isInteger(draft?.polyphonicProjection?.voiceCount)
      ? draft.polyphonicProjection.voiceCount
      : null,
    musicXmlBytes: typeof pipelineResult.musicXml === 'string'
      ? utf8ByteLength(pipelineResult.musicXml)
      : null,
    editorOpened: pipelineResult.editor == null
      ? null
      : pipelineResult.editor.ok === true,
    sourceIdentityMappingCount: sourceIdentityMappings?.length ?? null,
    guitarTabStatus: pipelineResult.guitarTab?.status ?? null,
    capabilities: pipelineResult.capabilities == null
      ? null
      : Object.freeze({ ...pipelineResult.capabilities }),
  });
}

function reviewState(calibration, ledger) {
  const availableDenominators = TEACHER_ACCEPTANCE_CORE_CATEGORIES.filter(
    (category) => calibration.categories[category].denominatorStatus === 'AVAILABLE',
  ).length;
  const suppliedDenominators = TEACHER_ACCEPTANCE_CORE_CATEGORIES.filter(
    (category) => calibration.categories[category].reviewedCount !== null,
  ).length;

  if (availableDenominators === TEACHER_ACCEPTANCE_CORE_CATEGORIES.length) return 'TEACHER_REVIEW_RECORDED';
  if (suppliedDenominators > 0 || ledger.entries.length > 0) return 'TEACHER_REVIEW_IN_PROGRESS';
  return 'AWAITING_TEACHER_REVIEW';
}

export function buildTeacherAcceptanceReport(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_TEACHER_ACCEPTANCE_REPORT', 'Teacher acceptance input must be a plain object.');
  }

  const ledger = createTeacherCorrectionLedger(input.ledger ?? {
    ledgerId: input.sessionId ? `${input.sessionId}:ledger` : 'teacher-acceptance-ledger',
  });
  const calibration = buildTeacherCalibrationReport({
    ledger,
    reviewedCounts: input.reviewedCounts ?? {},
    observations: input.observations ?? [],
    binCount: input.binCount,
  });
  const correctionSummary = summarizeTeacherCorrections(ledger);
  const pipeline = summarizePipeline(input.pipelineResult ?? null);
  const detectedEventCount = pipeline?.detectedEventCount ?? optionalNonNegativeNumber(input.detectedEventCount, 'detectedEventCount');
  const activeCorrectionEntriesPerDetectedEvent = detectedEventCount && detectedEventCount > 0
    ? correctionSummary.activeCorrectionCount / detectedEventCount
    : null;

  const recording = Object.freeze({
    recordingId: optionalString(input.recordingId ?? input.sessionId ?? 'recording', 'recordingId', 256),
    fileName: optionalString(input.fileName ?? input.pipelineResult?.fileName ?? null, 'fileName', 512),
    audioSha256: optionalString(input.audioSha256 ?? input.pipelineResult?.providerResult?.provenance?.audioSha256 ?? null, 'audioSha256', 128),
    instrument: optionalString(input.instrument ?? null, 'instrument', 128),
    durationSeconds: optionalNonNegativeNumber(input.durationSeconds, 'durationSeconds'),
  });

  return Object.freeze({
    schemaVersion: 'teacher-acceptance-report-v0.1',
    reportVersion: TEACHER_ACCEPTANCE_REPORT_VERSION,
    sessionId: optionalString(input.sessionId ?? 'teacher-acceptance-session', 'sessionId', 256),
    recording,
    reviewState: reviewState(calibration, ledger),
    teacherVerdict: optionalString(input.teacherVerdict ?? null, 'teacherVerdict', 256),
    teacherNotes: optionalString(input.teacherNotes ?? null, 'teacherNotes', 4000),
    pipeline,
    correctionSummary,
    calibration,
    workload: Object.freeze({
      detectedEventCount,
      activeCorrectionEntryCount: correctionSummary.activeCorrectionCount,
      activeCorrectionEntriesPerDetectedEvent,
      interpretation: 'WORKLOAD_SIGNAL_NOT_ACCURACY',
    }),
    combinedQualityScore: null,
    combinedQualityScorePolicy: 'NOT_REPORTED_BY_DESIGN',
    acceptanceThreshold: null,
    acceptanceThresholdPolicy: 'TEACHER_DEFINED_NOT_HARDCODED',
  });
}
