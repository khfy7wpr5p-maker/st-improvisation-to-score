import { ImprovisationToScoreError } from '../contracts.js';
import { buildScoreDraft } from '../scoreDraft.js';

export const BEAT_TEMPO_ADAPTER_VERSION = '0.1.0';
export const BEAT_TEMPO_SOURCE_AUTHORITY = 'SHADOW_EVIDENCE_ONLY';
export const BEAT_TEMPO_MAX_BEATS = 100_000;
export const BEAT_TEMPO_MAX_CANDIDATES = 32;

const DEFAULT_GATE = Object.freeze({
  minBeatCount: 4,
  minProviderConfidence: 0.8,
  minBeatConsistency: 0.8,
  maxBpmRelativeError: 0.04,
  ambiguityConfidenceMargin: 0.05,
});

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function boundedString(value, field, max = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail('INVALID_BEAT_TEMPO_CONTRACT', `${field} must be a non-empty bounded string.`, { field });
  }
  return value;
}

function finite(value, field, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_BEAT_TEMPO_CONTRACT', `${field} must be finite.`, { field, value });
  if ((exclusiveMin ? value <= min : value < min) || value > max) {
    fail('INVALID_BEAT_TEMPO_CONTRACT', `${field} is outside the admitted range.`, { field, value, min, max });
  }
  return value;
}

function normalizeGate(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_BEAT_TEMPO_OPTIONS', 'Beat/tempo gate options must be a plain object.');
  const minBeatCount = input.minBeatCount ?? DEFAULT_GATE.minBeatCount;
  if (!Number.isInteger(minBeatCount) || minBeatCount < 3 || minBeatCount > 128) {
    fail('INVALID_BEAT_TEMPO_OPTIONS', 'minBeatCount must be an integer in 3..128.');
  }
  return Object.freeze({
    minBeatCount,
    minProviderConfidence: finite(input.minProviderConfidence ?? DEFAULT_GATE.minProviderConfidence, 'minProviderConfidence', { min: 0, max: 1 }),
    minBeatConsistency: finite(input.minBeatConsistency ?? DEFAULT_GATE.minBeatConsistency, 'minBeatConsistency', { min: 0, max: 1 }),
    maxBpmRelativeError: finite(input.maxBpmRelativeError ?? DEFAULT_GATE.maxBpmRelativeError, 'maxBpmRelativeError', { min: 0, max: 0.5 }),
    ambiguityConfidenceMargin: finite(input.ambiguityConfidenceMargin ?? DEFAULT_GATE.ambiguityConfidenceMargin, 'ambiguityConfidenceMargin', { min: 0, max: 0.5 }),
  });
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function warning(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function ratioNear(left, right, target, tolerance = 0.035) {
  return left > 0 && right > 0 && Math.abs(left / right - target) <= tolerance;
}

function beatStatistics(beatTimesSeconds) {
  const intervals = [];
  for (let index = 1; index < beatTimesSeconds.length; index += 1) intervals.push(beatTimesSeconds[index] - beatTimesSeconds[index - 1]);
  const medianInterval = median(intervals);
  if (medianInterval === null || medianInterval <= 0) {
    return Object.freeze({ intervalsSeconds: Object.freeze(intervals), medianIntervalSeconds: null, observedBpm: null, normalizedMad: null, consistency: 0 });
  }
  const deviations = intervals.map((value) => Math.abs(value - medianInterval));
  const mad = median(deviations) ?? 0;
  const normalizedMad = mad / medianInterval;
  const consistency = Math.max(0, Math.min(1, 1 - normalizedMad / 0.12));
  return Object.freeze({
    intervalsSeconds: Object.freeze(intervals),
    medianIntervalSeconds: medianInterval,
    observedBpm: 60 / medianInterval,
    normalizedMad,
    consistency,
  });
}

export function adaptBeatTempoProviderResult(providerResult, gateInput = {}) {
  if (providerResult === null || typeof providerResult !== 'object' || Array.isArray(providerResult)) {
    fail('INVALID_BEAT_TEMPO_RESULT', 'Beat/tempo provider result must be an object.');
  }
  if (providerResult.ok !== true) {
    fail('BEAT_TEMPO_PROVIDER_NOT_SUCCESSFUL', 'A successful beat/tempo provider result is required.', {
      status: providerResult.status ?? null,
      reason: providerResult.reason ?? null,
    });
  }
  const providerId = boundedString(providerResult.providerId, 'providerId');
  const sourceId = boundedString(providerResult.sourceId, 'sourceId');
  if (providerResult.authority !== BEAT_TEMPO_SOURCE_AUTHORITY) {
    fail('BEAT_TEMPO_AUTHORITY_MISMATCH', 'Provider authority must remain SHADOW_EVIDENCE_ONLY at the adapter boundary.', {
      authority: providerResult.authority ?? null,
    });
  }
  if (!Array.isArray(providerResult.beatTimesSeconds)) fail('INVALID_BEAT_TEMPO_CONTRACT', 'beatTimesSeconds must be an array.');
  if (providerResult.beatTimesSeconds.length > BEAT_TEMPO_MAX_BEATS) {
    fail('BEAT_TEMPO_BEAT_LIMIT_EXCEEDED', 'Beat count exceeds the admitted adapter limit.', {
      limit: BEAT_TEMPO_MAX_BEATS,
      actual: providerResult.beatTimesSeconds.length,
    });
  }
  const beatTimesSeconds = providerResult.beatTimesSeconds.map((value, index) => finite(value, `beatTimesSeconds[${index}]`, { min: 0 }));
  for (let index = 1; index < beatTimesSeconds.length; index += 1) {
    if (beatTimesSeconds[index] <= beatTimesSeconds[index - 1]) {
      fail('INVALID_BEAT_TEMPO_CONTRACT', 'beatTimesSeconds must be strictly increasing.', { index });
    }
  }

  if (!Array.isArray(providerResult.tempoCandidates)) fail('INVALID_BEAT_TEMPO_CONTRACT', 'tempoCandidates must be an array.');
  if (providerResult.tempoCandidates.length === 0 || providerResult.tempoCandidates.length > BEAT_TEMPO_MAX_CANDIDATES) {
    fail('INVALID_BEAT_TEMPO_CONTRACT', 'tempoCandidates must contain 1..32 entries.', { actual: providerResult.tempoCandidates.length });
  }
  const tempoCandidates = providerResult.tempoCandidates.map((candidate, index) => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      fail('INVALID_BEAT_TEMPO_CONTRACT', 'Each tempo candidate must be an object.', { index });
    }
    return Object.freeze({
      bpm: finite(candidate.bpm, `tempoCandidates[${index}].bpm`, { min: 20, max: 400 }),
      confidence: finite(candidate.confidence, `tempoCandidates[${index}].confidence`, { min: 0, max: 1 }),
    });
  }).sort((a, b) => b.confidence - a.confidence || a.bpm - b.bpm);

  const gate = normalizeGate(gateInput);
  const stats = beatStatistics(beatTimesSeconds);
  const top = tempoCandidates[0];
  const second = tempoCandidates[1] ?? null;
  const relativeError = stats.observedBpm === null ? Infinity : Math.abs(top.bpm - stats.observedBpm) / stats.observedBpm;
  const halfDoubleAmbiguity = second !== null &&
    top.confidence - second.confidence <= gate.ambiguityConfidenceMargin &&
    (ratioNear(second.bpm, top.bpm, 2) || ratioNear(second.bpm, top.bpm, 0.5));

  const warnings = [];
  if (beatTimesSeconds.length < gate.minBeatCount) warnings.push(warning('BEAT_TEMPO_INSUFFICIENT_BEATS', 'Too few beat observations are available for automatic tempo admission.', { beatCount: beatTimesSeconds.length }));
  if (top.confidence < gate.minProviderConfidence) warnings.push(warning('BEAT_TEMPO_LOW_PROVIDER_CONFIDENCE', 'Provider confidence is below the automatic tempo admission gate.', { confidence: top.confidence }));
  if (stats.consistency < gate.minBeatConsistency) warnings.push(warning('BEAT_TEMPO_UNSTABLE_BEAT_SPACING', 'Beat spacing is too variable for a single constant-BPM transcription context.', { consistency: stats.consistency }));
  if (relativeError > gate.maxBpmRelativeError) warnings.push(warning('BEAT_TEMPO_BPM_PERIOD_MISMATCH', 'Provider BPM disagrees with the observed median beat period.', { providerBpm: top.bpm, observedBpm: stats.observedBpm, relativeError }));
  if (halfDoubleAmbiguity) warnings.push(warning('BEAT_TEMPO_HALF_DOUBLE_AMBIGUITY', 'Provider retains a near-equal half/double tempo candidate.', { topBpm: top.bpm, rivalBpm: second.bpm }));

  const admitted = beatTimesSeconds.length >= gate.minBeatCount &&
    top.confidence >= gate.minProviderConfidence &&
    stats.consistency >= gate.minBeatConsistency &&
    relativeError <= gate.maxBpmRelativeError &&
    !halfDoubleAmbiguity;

  return Object.freeze({
    schemaVersion: 'beat-tempo-evidence-v0.1',
    adapterVersion: BEAT_TEMPO_ADAPTER_VERSION,
    sourceAuthority: BEAT_TEMPO_SOURCE_AUTHORITY,
    providerId,
    sourceId,
    status: admitted ? 'AUTO_TEMPO_ADMITTED' : 'TEMPO_GUIDANCE_REQUIRED',
    beatTimesSeconds: Object.freeze(beatTimesSeconds),
    tempoCandidates: Object.freeze(tempoCandidates),
    topCandidate: top,
    statistics: stats,
    gate,
    admittedBpm: admitted ? top.bpm : null,
    warnings: Object.freeze(warnings),
  });
}

export function buildScoreDraftFromBeatTempoProvider(rawEvents, providerResult, contextTemplate, options = {}) {
  if (contextTemplate === null || typeof contextTemplate !== 'object' || Array.isArray(contextTemplate)) {
    fail('INVALID_TRANSCRIPTION_CONTEXT', 'contextTemplate must be a plain object.');
  }
  const evidence = adaptBeatTempoProviderResult(providerResult, options.gate ?? options);

  if (contextTemplate.bpm !== undefined && contextTemplate.bpm !== null) {
    const draft = buildScoreDraft(rawEvents, contextTemplate);
    return Object.freeze({
      schemaVersion: 'auto-tempo-score-result-v0.1',
      status: 'USER_TEMPO_DRAFT_READY',
      timingAuthority: 'USER_SUPPLIED',
      admittedBpm: draft.context.bpm,
      evidence,
      draft,
    });
  }

  if (evidence.admittedBpm === null) {
    return Object.freeze({
      schemaVersion: 'auto-tempo-score-result-v0.1',
      status: 'TEMPO_GUIDANCE_REQUIRED',
      timingAuthority: 'NONE',
      admittedBpm: null,
      evidence,
      draft: null,
    });
  }

  const draft = buildScoreDraft(rawEvents, { ...contextTemplate, bpm: evidence.admittedBpm });
  return Object.freeze({
    schemaVersion: 'auto-tempo-score-result-v0.1',
    status: 'AUTO_TEMPO_DRAFT_READY',
    timingAuthority: 'ADMITTED_BEAT_PROVIDER_EVIDENCE',
    admittedBpm: evidence.admittedBpm,
    evidence,
    draft,
  });
}
