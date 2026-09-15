import { ImprovisationToScoreError } from '../contracts.js';
import {
  createTeacherCorrectionLedger,
  teacherCorrectionCategory,
} from './correctionLedger.js';

export const TEACHER_CALIBRATION_METRICS_VERSION = '0.1.0';
export const TEACHER_CALIBRATION_CORE_CATEGORIES = Object.freeze(['PITCH', 'ONSET', 'DURATION', 'RHYTHM', 'VOICE']);
export const TEACHER_CALIBRATION_MAX_OBSERVATIONS = 1_000_000;

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function warning(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function targetKey(entry) {
  return `${entry.target.kind}:${entry.target.id}`;
}

function normalizeReviewedCounts(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TEACHER_CALIBRATION_COUNTS', 'reviewedCounts must be a plain object.');
  const normalized = {};
  for (const category of TEACHER_CALIBRATION_CORE_CATEGORIES) {
    const raw = input[category] ?? input[category.toLowerCase()] ?? null;
    if (raw === null || raw === undefined) {
      normalized[category] = null;
      continue;
    }
    if (!Number.isInteger(raw) || raw < 0) fail('INVALID_TEACHER_CALIBRATION_COUNTS', `${category} reviewed count must be a non-negative integer.`, { category, value: raw });
    normalized[category] = raw;
  }
  return Object.freeze(normalized);
}

function normalizeCategory(input, index) {
  if (typeof input.category === 'string' && input.category.trim()) return input.category.trim().toUpperCase();
  if (typeof input.dimension === 'string' && input.dimension.trim()) return teacherCorrectionCategory(input.dimension);
  fail('INVALID_TEACHER_CALIBRATION_OBSERVATION', 'Observation requires category or dimension.', { index });
}

function normalizeObservations(input) {
  if (input === undefined) return Object.freeze([]);
  if (!Array.isArray(input)) fail('INVALID_TEACHER_CALIBRATION_OBSERVATIONS', 'observations must be an array.');
  if (input.length > TEACHER_CALIBRATION_MAX_OBSERVATIONS) {
    fail('TEACHER_CALIBRATION_OBSERVATION_LIMIT_EXCEEDED', 'Observation count exceeds the resource-safety limit.', {
      limit: TEACHER_CALIBRATION_MAX_OBSERVATIONS,
      actual: input.length,
    });
  }
  return Object.freeze(input.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) fail('INVALID_TEACHER_CALIBRATION_OBSERVATION', 'Each observation must be a plain object.', { index });
    if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      fail('INVALID_TEACHER_CALIBRATION_OBSERVATION', 'Observation confidence must be finite in 0..1.', { index, value: item.confidence });
    }
    if (typeof item.corrected !== 'boolean') fail('INVALID_TEACHER_CALIBRATION_OBSERVATION', 'Observation corrected must be boolean.', { index });
    return Object.freeze({
      category: normalizeCategory(item, index),
      confidence: item.confidence,
      corrected: item.corrected,
      targetId: item.targetId == null ? null : String(item.targetId).slice(0, 256),
    });
  }));
}

function normalizeBinCount(value) {
  const binCount = value ?? 10;
  if (!Number.isInteger(binCount) || binCount < 2 || binCount > 100) fail('INVALID_TEACHER_CALIBRATION_BIN_COUNT', 'binCount must be an integer in 2..100.');
  return binCount;
}

function calibrationMetrics(observations, binCount) {
  if (observations.length === 0) return null;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    index,
    lowerInclusive: index / binCount,
    upperInclusive: (index + 1) / binCount,
    count: 0,
    confidenceSum: 0,
    correctSum: 0,
  }));

  let confidenceSum = 0;
  let correctSum = 0;
  let brierSum = 0;
  for (const observation of observations) {
    const correct = observation.corrected ? 0 : 1;
    const index = Math.min(binCount - 1, Math.floor(observation.confidence * binCount));
    const bin = bins[index];
    bin.count += 1;
    bin.confidenceSum += observation.confidence;
    bin.correctSum += correct;
    confidenceSum += observation.confidence;
    correctSum += correct;
    brierSum += (observation.confidence - correct) ** 2;
  }

  let ece = 0;
  const materializedBins = bins
    .filter((bin) => bin.count > 0)
    .map((bin) => {
      const meanConfidence = bin.confidenceSum / bin.count;
      const empiricalAccuracy = bin.correctSum / bin.count;
      ece += (bin.count / observations.length) * Math.abs(meanConfidence - empiricalAccuracy);
      return Object.freeze({
        index: bin.index,
        lowerInclusive: bin.lowerInclusive,
        upperInclusive: bin.upperInclusive,
        count: bin.count,
        meanConfidence,
        empiricalAccuracy,
        calibrationGap: meanConfidence - empiricalAccuracy,
      });
    });

  return Object.freeze({
    observationCount: observations.length,
    meanConfidence: confidenceSum / observations.length,
    empiricalAccuracy: correctSum / observations.length,
    brierScore: brierSum / observations.length,
    expectedCalibrationError: ece,
    bins: Object.freeze(materializedBins),
  });
}

export function buildTeacherCalibrationReport(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TEACHER_CALIBRATION_INPUT', 'Calibration input must be a plain object.');
  const ledger = createTeacherCorrectionLedger(input.ledger ?? {});
  const reviewedCounts = normalizeReviewedCounts(input.reviewedCounts ?? {});
  const observations = normalizeObservations(input.observations);
  const binCount = normalizeBinCount(input.binCount);
  const warnings = [];
  const categories = {};

  for (const category of TEACHER_CALIBRATION_CORE_CATEGORIES) {
    const activeEntries = ledger.activeCorrections.filter((entry) => entry.category === category);
    const correctedTargets = new Set(activeEntries.map(targetKey));
    const reviewedCount = reviewedCounts[category];
    let correctionRate = null;
    let teacherReviewedAccuracy = null;
    let denominatorStatus = 'NOT_PROVIDED';

    if (reviewedCount !== null) {
      if (reviewedCount < correctedTargets.size) {
        denominatorStatus = 'INCONSISTENT';
        warnings.push(warning('REVIEW_DENOMINATOR_BELOW_CORRECTED_TARGETS', 'Reviewed denominator is below the number of distinct corrected targets; rate is withheld instead of clamped.', {
          category,
          reviewedCount,
          correctedTargetCount: correctedTargets.size,
        }));
      } else if (reviewedCount === 0) {
        denominatorStatus = correctedTargets.size === 0 ? 'EMPTY' : 'INCONSISTENT';
      } else {
        denominatorStatus = 'AVAILABLE';
        correctionRate = correctedTargets.size / reviewedCount;
        teacherReviewedAccuracy = 1 - correctionRate;
      }
    }

    const categoryObservations = observations.filter((item) => item.category === category);
    categories[category] = Object.freeze({
      activeCorrectionEntryCount: activeEntries.length,
      correctedTargetCount: correctedTargets.size,
      reviewedCount,
      denominatorStatus,
      correctionRate,
      teacherReviewedAccuracy,
      calibration: calibrationMetrics(categoryObservations, binCount),
    });
  }

  const recognizedObservationCount = observations.filter((item) => TEACHER_CALIBRATION_CORE_CATEGORIES.includes(item.category)).length;
  return Object.freeze({
    schemaVersion: 'teacher-calibration-report-v0.1',
    metricsVersion: TEACHER_CALIBRATION_METRICS_VERSION,
    ledgerId: ledger.ledgerId,
    ledgerRevision: ledger.revision,
    categories: Object.freeze(categories),
    observationCount: observations.length,
    recognizedObservationCount,
    uncategorizedObservationCount: observations.length - recognizedObservationCount,
    warnings: Object.freeze(warnings),
    combinedAccuracy: null,
    combinedAccuracyPolicy: 'NOT_REPORTED_BY_DESIGN',
  });
}
