import { ImprovisationToScoreError, rational, rationalToNumber } from '../contracts.js';
import { buildScoreDraft } from '../scoreDraft.js';
import { createTimingMap } from './timingMap.js';

export const LOCAL_TEMPO_SEGMENT_ANALYZER_VERSION = '0.1.0';
export const LOCAL_TEMPO_SEGMENT_AUTHORITY = 'NON_CANONICAL_LOCAL_TEMPO_EVIDENCE';
export const LOCAL_TEMPO_MAX_BEATS = 100_000;
export const LOCAL_TEMPO_MAX_CHANGES = 512;

const DEFAULTS = Object.freeze({
  windowIntervals: 4,
  stepIntervals: 2,
  minWindowConsistency: 0.55,
  minTempoChangeRelative: 0.04,
  minAnchorConfidence: 0.72,
  ambiguityConfidenceMargin: 0.06,
  minSegmentBeats: 2,
  quarterNotesPerBeat: 1,
  maxChanges: 256,
});

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function finite(value, field, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_LOCAL_TEMPO_INPUT', `${field} must be finite.`, { field, value });
  if ((exclusiveMin ? value <= min : value < min) || value > max) {
    fail('INVALID_LOCAL_TEMPO_INPUT', `${field} is outside the admitted range.`, { field, value, min, max });
  }
  return value;
}

function integer(value, field, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) fail('INVALID_LOCAL_TEMPO_OPTIONS', `${field} must be an integer in ${min}..${max}.`, { field, value });
  return value;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function warning(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function ratioNear(left, right, target, tolerance = 0.04) {
  return left > 0 && right > 0 && Math.abs(left / right - target) <= tolerance;
}

function toRationalApprox(value) {
  finite(value, 'rationalApproxValue', { min: 0 });
  const denominator = 1_000_000;
  return rational(Math.round(value * denominator), denominator);
}

function addRational(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function scaleRational(value, factor) {
  return toRationalApprox(rationalToNumber(value) * factor);
}

function normalizeOptions(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_LOCAL_TEMPO_OPTIONS', 'Local-tempo options must be a plain object.');
  const windowIntervals = integer(input.windowIntervals ?? DEFAULTS.windowIntervals, 'windowIntervals', { min: 2, max: 64 });
  const stepIntervals = integer(input.stepIntervals ?? Math.min(DEFAULTS.stepIntervals, windowIntervals), 'stepIntervals', { min: 1, max: 64 });
  const maxChanges = integer(input.maxChanges ?? DEFAULTS.maxChanges, 'maxChanges', { min: 1, max: LOCAL_TEMPO_MAX_CHANGES });
  return Object.freeze({
    windowIntervals,
    stepIntervals,
    minWindowConsistency: finite(input.minWindowConsistency ?? DEFAULTS.minWindowConsistency, 'minWindowConsistency', { min: 0, max: 1 }),
    minTempoChangeRelative: finite(input.minTempoChangeRelative ?? DEFAULTS.minTempoChangeRelative, 'minTempoChangeRelative', { min: 0, max: 1 }),
    minAnchorConfidence: finite(input.minAnchorConfidence ?? DEFAULTS.minAnchorConfidence, 'minAnchorConfidence', { min: 0, max: 1 }),
    ambiguityConfidenceMargin: finite(input.ambiguityConfidenceMargin ?? DEFAULTS.ambiguityConfidenceMargin, 'ambiguityConfidenceMargin', { min: 0, max: 0.5 }),
    minSegmentBeats: integer(input.minSegmentBeats ?? DEFAULTS.minSegmentBeats, 'minSegmentBeats', { min: 1, max: 32 }),
    quarterNotesPerBeat: finite(input.quarterNotesPerBeat ?? DEFAULTS.quarterNotesPerBeat, 'quarterNotesPerBeat', { min: 0.125, max: 8, exclusiveMin: true }),
    maxChanges,
  });
}

function normalizeEvidence(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_LOCAL_TEMPO_EVIDENCE', 'Beat/tempo evidence must be an object.');
  if (!Array.isArray(input.beatTimesSeconds) || input.beatTimesSeconds.length > LOCAL_TEMPO_MAX_BEATS) {
    fail('INVALID_LOCAL_TEMPO_EVIDENCE', 'beatTimesSeconds must be a bounded array.');
  }
  const beatTimesSeconds = input.beatTimesSeconds.map((value, index) => finite(value, `beatTimesSeconds[${index}]`, { min: 0 }));
  for (let index = 1; index < beatTimesSeconds.length; index += 1) {
    if (beatTimesSeconds[index] <= beatTimesSeconds[index - 1]) fail('INVALID_LOCAL_TEMPO_EVIDENCE', 'beatTimesSeconds must be strictly increasing.', { index });
  }
  const candidates = Array.isArray(input.tempoCandidates) ? input.tempoCandidates.map((candidate, index) => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) fail('INVALID_LOCAL_TEMPO_EVIDENCE', 'tempo candidate must be an object.', { index });
    return Object.freeze({
      bpm: finite(candidate.bpm, `tempoCandidates[${index}].bpm`, { min: 1, max: 1000, exclusiveMin: true }),
      confidence: finite(candidate.confidence, `tempoCandidates[${index}].confidence`, { min: 0, max: 1 }),
    });
  }).sort((a, b) => b.confidence - a.confidence || a.bpm - b.bpm) : [];
  const topCandidate = input.topCandidate && typeof input.topCandidate === 'object'
    ? Object.freeze({
      bpm: finite(input.topCandidate.bpm, 'topCandidate.bpm', { min: 1, max: 1000, exclusiveMin: true }),
      confidence: finite(input.topCandidate.confidence, 'topCandidate.confidence', { min: 0, max: 1 }),
    })
    : candidates[0] ?? null;
  const admittedBpm = input.admittedBpm == null ? null : finite(input.admittedBpm, 'admittedBpm', { min: 1, max: 1000, exclusiveMin: true });
  return Object.freeze({
    beatTimesSeconds: Object.freeze(beatTimesSeconds),
    tempoCandidates: Object.freeze(candidates),
    topCandidate,
    admittedBpm,
    providerId: typeof input.providerId === 'string' ? input.providerId.slice(0, 256) : null,
    sourceId: typeof input.sourceId === 'string' ? input.sourceId.slice(0, 256) : null,
  });
}

function intervalStats(intervals) {
  const center = median(intervals);
  if (center === null || center <= 0) return Object.freeze({ medianIntervalSeconds: null, normalizedMad: null, consistency: 0 });
  const deviations = intervals.map((value) => Math.abs(value - center));
  const mad = median(deviations) ?? 0;
  const normalizedMad = mad / center;
  return Object.freeze({
    medianIntervalSeconds: center,
    normalizedMad,
    consistency: clamp01(1 - normalizedMad / 0.25),
  });
}

function anchorState(evidence, options) {
  const top = evidence.topCandidate;
  const second = evidence.tempoCandidates.find((candidate) => top && candidate !== top && candidate.bpm !== top.bpm) ?? evidence.tempoCandidates[1] ?? null;
  const halfDoubleAmbiguity = top !== null && second !== null &&
    top.confidence - second.confidence <= options.ambiguityConfidenceMargin &&
    (ratioNear(second.bpm, top.bpm, 2) || ratioNear(second.bpm, top.bpm, 0.5));
  const candidateAnchor = evidence.admittedBpm ?? top?.bpm ?? null;
  const anchorConfidence = evidence.admittedBpm !== null ? 1 : top?.confidence ?? 0;
  const usable = candidateAnchor !== null && anchorConfidence >= options.minAnchorConfidence && !halfDoubleAmbiguity;
  return Object.freeze({
    bpm: candidateAnchor === null ? null : candidateAnchor * options.quarterNotesPerBeat,
    confidence: anchorConfidence,
    halfDoubleAmbiguity,
    usable,
  });
}

export function analyzeLocalTempoSegments(evidenceInput, optionsInput = {}) {
  const evidence = normalizeEvidence(evidenceInput);
  const options = normalizeOptions(optionsInput);
  const anchor = anchorState(evidence, options);
  const warnings = [];
  if (evidence.beatTimesSeconds.length < 3) warnings.push(warning('LOCAL_TEMPO_INSUFFICIENT_BEATS', 'Too few beat observations are available for local tempo segmentation.', { beatCount: evidence.beatTimesSeconds.length }));
  if (anchor.bpm === null) warnings.push(warning('LOCAL_TEMPO_NO_ANCHOR_CANDIDATE', 'No tempo anchor candidate is available; local evidence remains review-only.'));
  if (anchor.confidence < options.minAnchorConfidence) warnings.push(warning('LOCAL_TEMPO_WEAK_ANCHOR', 'Tempo anchor confidence is below the local-map admission preference.', { confidence: anchor.confidence }));
  if (anchor.halfDoubleAmbiguity) warnings.push(warning('LOCAL_TEMPO_HALF_DOUBLE_AMBIGUITY', 'Half/double tempo ambiguity is preserved; a local timing map will not be auto-admitted.'));

  const intervals = [];
  for (let index = 1; index < evidence.beatTimesSeconds.length; index += 1) intervals.push(evidence.beatTimesSeconds[index] - evidence.beatTimesSeconds[index - 1]);
  const windows = [];
  for (let start = 0; start < intervals.length; start += options.stepIntervals) {
    const slice = intervals.slice(start, Math.min(intervals.length, start + options.windowIntervals));
    if (slice.length < 2) break;
    const stats = intervalStats(slice);
    const localBpm = stats.medianIntervalSeconds === null ? null : options.quarterNotesPerBeat * 60 / stats.medianIntervalSeconds;
    windows.push(Object.freeze({
      startBeatIndex: start,
      endBeatIndex: start + slice.length,
      intervalCount: slice.length,
      bpm: localBpm,
      consistency: stats.consistency,
      normalizedMad: stats.normalizedMad,
      admittedForChangeDetection: localBpm !== null && stats.consistency >= options.minWindowConsistency,
    }));
  }

  const changeBeatIndices = [0];
  let lastReferenceBpm = windows.find((item) => item.admittedForChangeDetection)?.bpm ?? anchor.bpm;
  let lastBoundary = 0;
  for (const item of windows) {
    if (!item.admittedForChangeDetection || item.startBeatIndex <= 0 || lastReferenceBpm === null) continue;
    if (item.startBeatIndex - lastBoundary < options.minSegmentBeats) continue;
    const relativeChange = Math.abs(item.bpm - lastReferenceBpm) / Math.max(lastReferenceBpm, 1e-9);
    if (relativeChange < options.minTempoChangeRelative) continue;
    changeBeatIndices.push(item.startBeatIndex);
    lastBoundary = item.startBeatIndex;
    lastReferenceBpm = item.bpm;
    if (changeBeatIndices.length >= options.maxChanges) {
      warnings.push(warning('LOCAL_TEMPO_CHANGE_LIMIT_REACHED', 'Local tempo evidence reached the configured change limit.', { maxChanges: options.maxChanges }));
      break;
    }
  }

  return Object.freeze({
    schemaVersion: 'local-tempo-evidence-v0.1',
    analyzerVersion: LOCAL_TEMPO_SEGMENT_ANALYZER_VERSION,
    authority: LOCAL_TEMPO_SEGMENT_AUTHORITY,
    status: anchor.usable && intervals.length >= 2 ? 'LOCAL_TEMPO_EVIDENCE_READY' : 'LOCAL_TEMPO_GUIDANCE_ONLY',
    evidence,
    options,
    anchor,
    windows: Object.freeze(windows),
    changeBeatIndices: Object.freeze(changeBeatIndices),
    warnings: Object.freeze(warnings),
  });
}

function segmentAverageBpm(beatTimesSeconds, startBeatIndex, endBeatIndex, quarterNotesPerBeat) {
  if (endBeatIndex <= startBeatIndex) return null;
  const elapsed = beatTimesSeconds[endBeatIndex] - beatTimesSeconds[startBeatIndex];
  if (!(elapsed > 0)) return null;
  return (endBeatIndex - startBeatIndex) * quarterNotesPerBeat * 60 / elapsed;
}

export function createLocalTempoTimingMap(evidenceInput, contextTemplate, optionsInput = {}) {
  if (contextTemplate === null || typeof contextTemplate !== 'object' || Array.isArray(contextTemplate)) fail('INVALID_LOCAL_TEMPO_CONTEXT', 'contextTemplate must be a plain object.');
  const analysis = analyzeLocalTempoSegments(evidenceInput, optionsInput);
  if (!analysis.anchor.usable || analysis.evidence.beatTimesSeconds.length < 3) {
    return Object.freeze({ status: 'LOCAL_TEMPO_GUIDANCE_ONLY', analysis, timingMap: null });
  }

  const { beatTimesSeconds } = analysis.evidence;
  const qpb = analysis.options.quarterNotesPerBeat;
  const firstBeatQuarter = toRationalApprox(beatTimesSeconds[0] * analysis.anchor.bpm / 60);
  const boundaries = [...analysis.changeBeatIndices]
    .filter((value, index, array) => value >= 0 && value < beatTimesSeconds.length - 1 && (index === 0 || value > array[index - 1]));
  if (boundaries.length === 0 || boundaries[0] !== 0) boundaries.unshift(0);

  const localSegments = [];
  for (let index = 0; index < boundaries.length; index += 1) {
    const startBeatIndex = boundaries[index];
    const endBeatIndex = boundaries[index + 1] ?? beatTimesSeconds.length - 1;
    const bpm = segmentAverageBpm(beatTimesSeconds, startBeatIndex, endBeatIndex, qpb);
    if (bpm === null || !Number.isFinite(bpm) || bpm <= 0) continue;
    const positionQuarter = addRational(firstBeatQuarter, scaleRational(rational(startBeatIndex, 1), qpb));
    localSegments.push(Object.freeze({ startBeatIndex, endBeatIndex, positionQuarter, bpm }));
  }

  if (localSegments.length === 0) return Object.freeze({ status: 'LOCAL_TEMPO_GUIDANCE_ONLY', analysis, timingMap: null });

  const tempoChanges = [];
  if (beatTimesSeconds[0] > 0) {
    tempoChanges.push({ positionQuarter: rational(0, 1), bpm: analysis.anchor.bpm, sourceAuthority: 'LOCAL_TEMPO_ANCHOR_EVIDENCE' });
  }
  for (const segment of localSegments) {
    const positionNumber = rationalToNumber(segment.positionQuarter);
    if (positionNumber <= 0 && tempoChanges.length === 0) {
      tempoChanges.push({ positionQuarter: rational(0, 1), bpm: segment.bpm, sourceAuthority: 'ADMITTED_LOCAL_BEAT_EVIDENCE' });
      continue;
    }
    const previous = tempoChanges.at(-1);
    if (previous && Math.abs(rationalToNumber(previous.positionQuarter) - positionNumber) < 1e-9) {
      tempoChanges[tempoChanges.length - 1] = { positionQuarter: segment.positionQuarter, bpm: segment.bpm, sourceAuthority: 'ADMITTED_LOCAL_BEAT_EVIDENCE' };
    } else {
      tempoChanges.push({ positionQuarter: segment.positionQuarter, bpm: segment.bpm, sourceAuthority: 'ADMITTED_LOCAL_BEAT_EVIDENCE' });
    }
    if (tempoChanges.length >= analysis.options.maxChanges) break;
  }
  if (tempoChanges.length === 0) tempoChanges.push({ positionQuarter: rational(0, 1), bpm: analysis.anchor.bpm, sourceAuthority: 'LOCAL_TEMPO_ANCHOR_EVIDENCE' });

  const meterNumerator = contextTemplate.meterNumerator;
  const meterDenominator = contextTemplate.meterDenominator;
  if (!Number.isInteger(meterNumerator) || !Number.isInteger(meterDenominator)) {
    fail('INVALID_LOCAL_TEMPO_CONTEXT', 'meterNumerator and meterDenominator are required to materialize a timing map.');
  }

  const timingMap = createTimingMap({
    source: 'LOCAL_BEAT_TEMPO_EVIDENCE',
    tempoChanges,
    meterChanges: [{
      positionQuarter: rational(0, 1),
      numerator: meterNumerator,
      denominator: meterDenominator,
      sourceAuthority: contextTemplate.meterSourceAuthority ?? 'TRANSCRIPTION_CONTEXT',
    }],
  });

  return Object.freeze({
    status: timingMap.tempoChanges.length > 1 ? 'LOCAL_TEMPO_MAP_READY' : 'LOCAL_TEMPO_CONSTANT_MAP_READY',
    analysis,
    timingMap,
    localSegments: Object.freeze(localSegments),
  });
}

export function buildScoreDraftFromLocalTempoEvidence(rawEvents, evidenceInput, contextTemplate, optionsInput = {}) {
  if (contextTemplate === null || typeof contextTemplate !== 'object' || Array.isArray(contextTemplate)) fail('INVALID_LOCAL_TEMPO_CONTEXT', 'contextTemplate must be a plain object.');

  if (contextTemplate.bpm !== undefined && contextTemplate.bpm !== null) {
    const draft = buildScoreDraft(rawEvents, contextTemplate, {
      timingMapMetadata: {
        source: 'USER_TRANSCRIPTION_CONTEXT',
        tempoSourceAuthority: 'USER_SUPPLIED',
        meterSourceAuthority: 'TRANSCRIPTION_CONTEXT',
      },
    });
    return Object.freeze({
      schemaVersion: 'local-tempo-score-result-v0.1',
      status: 'USER_TEMPO_DRAFT_READY',
      timingAuthority: 'USER_SUPPLIED',
      analysis: analyzeLocalTempoSegments(evidenceInput, optionsInput),
      draft,
    });
  }

  const local = createLocalTempoTimingMap(evidenceInput, contextTemplate, optionsInput);
  if (local.timingMap !== null) {
    const originBpm = local.timingMap.tempoChanges[0].bpm;
    const draft = buildScoreDraft(rawEvents, { ...contextTemplate, bpm: originBpm }, { timingMap: local.timingMap });
    return Object.freeze({
      schemaVersion: 'local-tempo-score-result-v0.1',
      status: 'LOCAL_TEMPO_DRAFT_READY',
      timingAuthority: 'ADMITTED_LOCAL_BEAT_EVIDENCE',
      analysis: local.analysis,
      timingMap: local.timingMap,
      draft,
    });
  }

  const fallbackCandidate = local.analysis.evidence.topCandidate;
  if (fallbackCandidate === null) {
    return Object.freeze({
      schemaVersion: 'local-tempo-score-result-v0.1',
      status: 'TEMPO_EVIDENCE_UNAVAILABLE',
      timingAuthority: 'NONE',
      analysis: local.analysis,
      timingMap: null,
      draft: null,
    });
  }

  const provisionalBpm = fallbackCandidate.bpm * local.analysis.options.quarterNotesPerBeat;
  const draft = buildScoreDraft(rawEvents, { ...contextTemplate, bpm: provisionalBpm }, {
    timingMapMetadata: {
      source: 'PROVISIONAL_TEMPO_FALLBACK',
      tempoSourceAuthority: 'PROVISIONAL_PROVIDER_CANDIDATE',
      meterSourceAuthority: 'TRANSCRIPTION_CONTEXT',
    },
  });
  return Object.freeze({
    schemaVersion: 'local-tempo-score-result-v0.1',
    status: 'PROVISIONAL_TEMPO_DRAFT_READY',
    timingAuthority: 'PROVISIONAL_PROVIDER_CANDIDATE',
    analysis: local.analysis,
    timingMap: draft.timingMap,
    draft,
  });
}
