import { ImprovisationToScoreError } from '../contracts.js';

export const METER_CANDIDATE_ANALYZER_VERSION = '0.1.0';
export const METER_CANDIDATE_AUTHORITY = 'NON_CANONICAL_METER_HINT';
export const METER_CANDIDATE_MAX_BEATS = 100_000;

const DEFAULT_NUMERATORS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 12]);

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function warning(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function normalizeOptions(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_METER_OPTIONS', 'Meter options must be a plain object.');
  const candidateNumerators = input.candidateNumerators ?? DEFAULT_NUMERATORS;
  if (!Array.isArray(candidateNumerators) || candidateNumerators.length === 0 || candidateNumerators.length > 16) {
    fail('INVALID_METER_OPTIONS', 'candidateNumerators must be a bounded non-empty array.');
  }
  const unique = [...new Set(candidateNumerators)];
  if (unique.some((value) => !Number.isInteger(value) || value < 2 || value > 32)) {
    fail('INVALID_METER_OPTIONS', 'candidate numerators must be integers in 2..32.');
  }
  const beatUnitDenominatorHint = input.beatUnitDenominatorHint ?? null;
  if (beatUnitDenominatorHint !== null && ![2, 4, 8, 16].includes(beatUnitDenominatorHint)) {
    fail('INVALID_METER_OPTIONS', 'beatUnitDenominatorHint must be null or one of 2,4,8,16.');
  }
  const maxCandidates = input.maxCandidates ?? 6;
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 16) {
    fail('INVALID_METER_OPTIONS', 'maxCandidates must be an integer in 1..16.');
  }
  return Object.freeze({
    candidateNumerators: Object.freeze(unique.sort((a, b) => a - b)),
    beatUnitDenominatorHint,
    maxCandidates,
    minStrengthRange: typeof input.minStrengthRange === 'number' ? input.minStrengthRange : 0.08,
    readyConfidence: typeof input.readyConfidence === 'number' ? input.readyConfidence : 0.75,
  });
}

function validateEvidence(evidence) {
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence)) fail('INVALID_METER_EVIDENCE', 'Meter evidence must be an object.');
  if (!Array.isArray(evidence.beatTimesSeconds)) fail('INVALID_METER_EVIDENCE', 'beatTimesSeconds must be an array.');
  if (evidence.beatTimesSeconds.length > METER_CANDIDATE_MAX_BEATS) fail('METER_BEAT_LIMIT_EXCEEDED', 'Beat count exceeds the admitted meter-analysis limit.');
  if (evidence.beatStrengths === null || evidence.beatStrengths === undefined) {
    return Object.freeze({ beatTimesSeconds: Object.freeze([...evidence.beatTimesSeconds]), beatStrengths: null });
  }
  if (!Array.isArray(evidence.beatStrengths) || evidence.beatStrengths.length !== evidence.beatTimesSeconds.length) {
    fail('INVALID_METER_EVIDENCE', 'beatStrengths must align one-to-one with beatTimesSeconds.');
  }
  const strengths = evidence.beatStrengths.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      fail('INVALID_METER_EVIDENCE', 'beatStrengths values must be finite in 0..1.', { index, value });
    }
    return value;
  });
  return Object.freeze({ beatTimesSeconds: Object.freeze([...evidence.beatTimesSeconds]), beatStrengths: Object.freeze(strengths) });
}

function scoreNumerator(normalizedStrengths, numerator) {
  if (normalizedStrengths.length < numerator * 2) return null;
  let best = null;
  for (let phase = 0; phase < numerator; phase += 1) {
    const downbeats = [];
    const others = [];
    for (let index = 0; index < normalizedStrengths.length; index += 1) {
      (index % numerator === phase ? downbeats : others).push(normalizedStrengths[index]);
    }
    if (downbeats.length < 2 || others.length === 0) continue;
    const downMean = mean(downbeats);
    const otherMean = mean(others);
    const contrast = Math.max(0, Math.min(1, downMean - otherMean));
    const downMedian = median(downbeats);
    const mad = median(downbeats.map((value) => Math.abs(value - downMedian)));
    const consistency = Math.max(0, Math.min(1, 1 - mad / 0.35));
    const coverage = Math.min(1, normalizedStrengths.length / (numerator * 3));
    const score = 0.65 * contrast + 0.2 * consistency + 0.15 * coverage;
    const candidate = Object.freeze({
      numerator,
      downbeatPhase: phase,
      score: Number(score.toFixed(6)),
      contrast: Number(contrast.toFixed(6)),
      consistency: Number(consistency.toFixed(6)),
      coverage: Number(coverage.toFixed(6)),
    });
    if (best === null || candidate.score > best.score || (candidate.score === best.score && candidate.downbeatPhase < best.downbeatPhase)) best = candidate;
  }
  return best;
}

function cycleRelated(a, b) {
  return a > 0 && b > 0 && (a === b * 2 || b === a * 2 || a === b * 3 || b === a * 3);
}

export function analyzeMeterCandidates(beatTempoEvidence, optionsInput = {}) {
  const options = normalizeOptions(optionsInput);
  const evidence = validateEvidence(beatTempoEvidence);
  if (evidence.beatStrengths === null) {
    return Object.freeze({
      schemaVersion: 'meter-candidate-analysis-v0.1',
      analyzerVersion: METER_CANDIDATE_ANALYZER_VERSION,
      authority: METER_CANDIDATE_AUTHORITY,
      status: 'INSUFFICIENT_ACCENT_EVIDENCE',
      options,
      candidates: Object.freeze([]),
      recommendedMeterHint: null,
      confidence: 0,
      meterHintReady: false,
      contextReady: false,
      guidanceRequired: true,
      warnings: Object.freeze([warning('METER_STRENGTH_EVIDENCE_UNAVAILABLE', 'Beat strengths are unavailable; meter periodicity cannot be ranked safely.')]),
    });
  }

  const minStrength = Math.min(...evidence.beatStrengths);
  const maxStrength = Math.max(...evidence.beatStrengths);
  const range = maxStrength - minStrength;
  if (range < options.minStrengthRange) {
    return Object.freeze({
      schemaVersion: 'meter-candidate-analysis-v0.1',
      analyzerVersion: METER_CANDIDATE_ANALYZER_VERSION,
      authority: METER_CANDIDATE_AUTHORITY,
      status: 'INSUFFICIENT_ACCENT_EVIDENCE',
      options,
      candidates: Object.freeze([]),
      recommendedMeterHint: null,
      confidence: 0,
      meterHintReady: false,
      contextReady: false,
      guidanceRequired: true,
      warnings: Object.freeze([warning('METER_ACCENT_CONTRAST_TOO_LOW', 'Beat strengths do not contain enough accent contrast to rank meter cycles.', { range })]),
    });
  }

  const normalized = evidence.beatStrengths.map((value) => (value - minStrength) / range);
  const ranked = options.candidateNumerators
    .map((numerator) => scoreNumerator(normalized, numerator))
    .filter((candidate) => candidate !== null)
    .sort((a, b) => b.score - a.score || a.numerator - b.numerator || a.downbeatPhase - b.downbeatPhase)
    .slice(0, options.maxCandidates)
    .map((candidate, index) => Object.freeze({ rank: index + 1, ...candidate }));

  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const evidenceStrength = top === null ? 0 : Math.min(1, evidence.beatTimesSeconds.length / (top.numerator * 3));
  const separation = top === null ? 0 : Math.max(0, top.score - (second?.score ?? 0));
  const separationStrength = Math.min(1, separation / 0.12);
  let confidence = top === null ? 0 : top.score * (0.55 + 0.45 * evidenceStrength) * (0.4 + 0.6 * separationStrength);
  const cycleAmbiguity = top !== null && ranked.slice(1).some((candidate) =>
    candidate.score >= top.score - 0.055 && cycleRelated(candidate.numerator, top.numerator)
  );
  if (cycleAmbiguity) confidence = Math.min(confidence, 0.69);
  confidence = Number(Math.max(0, Math.min(1, confidence)).toFixed(6));

  const meterHintReady = top !== null && confidence >= options.readyConfidence && !cycleAmbiguity;
  const contextReady = meterHintReady && options.beatUnitDenominatorHint !== null;
  const warnings = [];
  if (cycleAmbiguity) warnings.push(warning('METER_CYCLE_AMBIGUITY', 'Related accent-cycle lengths remain near-equal.', { topNumerator: top?.numerator ?? null }));
  if (confidence < options.readyConfidence) warnings.push(warning('METER_LOW_CONFIDENCE', 'Meter candidate evidence is not strong enough for automatic context construction.', { confidence }));
  if (options.beatUnitDenominatorHint === null) warnings.push(warning('METER_BEAT_UNIT_UNKNOWN', 'Accent periodicity can suggest beats-per-measure, but the beat unit denominator is not inferred from strength alone.'));

  return Object.freeze({
    schemaVersion: 'meter-candidate-analysis-v0.1',
    analyzerVersion: METER_CANDIDATE_ANALYZER_VERSION,
    authority: METER_CANDIDATE_AUTHORITY,
    status: ranked.length > 0 ? 'METER_CANDIDATES_READY' : 'INSUFFICIENT_ACCENT_EVIDENCE',
    options,
    candidates: Object.freeze(ranked),
    recommendedMeterHint: top === null ? null : Object.freeze({
      beatsPerMeasure: top.numerator,
      numerator: top.numerator,
      denominator: options.beatUnitDenominatorHint,
      downbeatPhase: top.downbeatPhase,
    }),
    confidence,
    meterHintReady,
    contextReady,
    guidanceRequired: !contextReady,
    warnings: Object.freeze(warnings),
  });
}
