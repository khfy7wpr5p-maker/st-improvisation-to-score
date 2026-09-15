import { ImprovisationToScoreError, createRawPerformanceEvent } from '../contracts.js';

export const TEMPO_CANDIDATE_ANALYZER_VERSION = '0.1.0';
export const TEMPO_CANDIDATE_MAX_EVENTS = 100_000;
export const TEMPO_CANDIDATE_AUTHORITY = 'NON_CANONICAL_TIMING_HINT';

const DEFAULT_OPTIONS = Object.freeze({
  minBpm: 40,
  maxBpm: 240,
  onsetMergeToleranceSeconds: 0.045,
  bpmResolution: 0.5,
  maxCandidates: 8,
  smallestNoteDenominator: 16,
  allowTriplets: true,
});

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function finite(value, field, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('INVALID_TEMPO_OPTION', `${field} must be finite.`, { field, value });
  if ((exclusiveMin ? value <= min : value < min) || value > max) {
    fail('INVALID_TEMPO_OPTION', `${field} is outside the admitted range.`, { field, value, min, max });
  }
  return value;
}

function normalizeOptions(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TEMPO_OPTIONS', 'Tempo options must be a plain object.');
  const minBpm = finite(input.minBpm ?? DEFAULT_OPTIONS.minBpm, 'minBpm', { min: 20, max: 400 });
  const maxBpm = finite(input.maxBpm ?? DEFAULT_OPTIONS.maxBpm, 'maxBpm', { min: minBpm, max: 400, exclusiveMin: true });
  const onsetMergeToleranceSeconds = finite(
    input.onsetMergeToleranceSeconds ?? DEFAULT_OPTIONS.onsetMergeToleranceSeconds,
    'onsetMergeToleranceSeconds',
    { min: 0, max: 0.25 },
  );
  const bpmResolution = finite(input.bpmResolution ?? DEFAULT_OPTIONS.bpmResolution, 'bpmResolution', { min: 0.1, max: 5 });
  const maxCandidates = input.maxCandidates ?? DEFAULT_OPTIONS.maxCandidates;
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 32) {
    fail('INVALID_TEMPO_OPTION', 'maxCandidates must be an integer in 1..32.', { value: maxCandidates });
  }
  const smallestNoteDenominator = input.smallestNoteDenominator ?? DEFAULT_OPTIONS.smallestNoteDenominator;
  if (![8, 16, 32].includes(smallestNoteDenominator)) {
    fail('INVALID_TEMPO_OPTION', 'smallestNoteDenominator must be 8, 16, or 32.', { value: smallestNoteDenominator });
  }
  return Object.freeze({
    minBpm,
    maxBpm,
    onsetMergeToleranceSeconds,
    bpmResolution,
    maxCandidates,
    smallestNoteDenominator,
    allowTriplets: input.allowTriplets === undefined ? DEFAULT_OPTIONS.allowTriplets : input.allowTriplets === true,
  });
}

function normalizeEvents(rawEvents) {
  if (!Array.isArray(rawEvents)) fail('INVALID_EVENT_LIST', 'rawEvents must be an array.');
  if (rawEvents.length > TEMPO_CANDIDATE_MAX_EVENTS) {
    fail('TEMPO_EVENT_LIMIT_EXCEEDED', 'Raw event count exceeds the admitted tempo-analysis limit.', {
      limit: TEMPO_CANDIDATE_MAX_EVENTS,
      actual: rawEvents.length,
    });
  }
  const ids = new Set();
  return rawEvents.map((event) => {
    const normalized = createRawPerformanceEvent(event);
    if (ids.has(normalized.eventId)) fail('DUPLICATE_EVENT_ID', 'eventId values must be unique.', { eventId: normalized.eventId });
    ids.add(normalized.eventId);
    return normalized;
  }).sort((a, b) => a.onsetSeconds - b.onsetSeconds || a.midiPitch - b.midiPitch || a.eventId.localeCompare(b.eventId));
}

function groupAttacks(events, toleranceSeconds) {
  const groups = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (previous && event.onsetSeconds - previous.anchorSeconds <= toleranceSeconds) {
      previous.eventIds.push(event.eventId);
      previous.lastSeconds = Math.max(previous.lastSeconds, event.onsetSeconds);
      continue;
    }
    groups.push({
      anchorSeconds: event.onsetSeconds,
      lastSeconds: event.onsetSeconds,
      eventIds: [event.eventId],
    });
  }
  return Object.freeze(groups.map((group) => Object.freeze({
    onsetSeconds: group.anchorSeconds,
    spreadSeconds: group.lastSeconds - group.anchorSeconds,
    eventIds: Object.freeze([...group.eventIds]),
  })));
}

function intervalList(groups) {
  const result = [];
  for (let index = 1; index < groups.length; index += 1) {
    const seconds = groups[index].onsetSeconds - groups[index - 1].onsetSeconds;
    if (seconds > 1e-6) result.push(seconds);
  }
  return Object.freeze(result);
}

function rhythmValues(options) {
  const regularStep = 4 / options.smallestNoteDenominator;
  const values = new Set();
  for (let multiple = 1; multiple <= Math.ceil(4 / regularStep); multiple += 1) {
    values.add(Number((multiple * regularStep).toFixed(9)));
  }
  if (options.allowTriplets) {
    for (let multiple = 1; multiple <= 12; multiple += 1) values.add(Number((multiple / 3).toFixed(9)));
  }
  return [...values].sort((a, b) => a - b);
}

function nearestDistance(value, candidates) {
  let best = Infinity;
  for (const candidate of candidates) best = Math.min(best, Math.abs(value - candidate));
  return best;
}

function snapBpm(value, resolution) {
  return Math.round(value / resolution) * resolution;
}

function candidateKey(bpm) {
  return bpm.toFixed(6);
}

function buildCandidateBpms(intervals, options, admittedRhythms) {
  const map = new Map();
  for (const seconds of intervals) {
    for (const quarterUnits of admittedRhythms) {
      const raw = 60 * quarterUnits / seconds;
      if (raw < options.minBpm - options.bpmResolution || raw > options.maxBpm + options.bpmResolution) continue;
      const bpm = snapBpm(raw, options.bpmResolution);
      if (bpm < options.minBpm || bpm > options.maxBpm) continue;
      const key = candidateKey(bpm);
      const current = map.get(key) ?? { bpm, directSupport: 0 };
      current.directSupport += 1;
      map.set(key, current);
    }
  }
  return [...map.values()];
}

function scoreCandidate(candidate, groups, intervals, options, admittedRhythms, maxDirectSupport) {
  const baseStep = 4 / options.smallestNoteDenominator;
  const toleranceQuarter = Math.max(baseStep * 0.45, 0.055);
  let intervalFitTotal = 0;
  let supportedIntervals = 0;
  for (const seconds of intervals) {
    const quarterUnits = seconds * candidate.bpm / 60;
    const distance = nearestDistance(quarterUnits, admittedRhythms);
    const fit = Math.max(0, 1 - distance / toleranceQuarter);
    intervalFitTotal += fit;
    if (distance <= toleranceQuarter * 0.5) supportedIntervals += 1;
  }
  const intervalFit = intervals.length === 0 ? 0 : intervalFitTotal / intervals.length;
  const support = intervals.length === 0 ? 0 : supportedIntervals / intervals.length;

  const first = groups[0]?.onsetSeconds ?? 0;
  let phaseFitTotal = 0;
  const phaseSteps = options.allowTriplets ? [baseStep, 1 / 3] : [baseStep];
  for (const group of groups) {
    const quarterPosition = (group.onsetSeconds - first) * candidate.bpm / 60;
    let distance = Infinity;
    for (const step of phaseSteps) {
      const snapped = Math.round(quarterPosition / step) * step;
      distance = Math.min(distance, Math.abs(quarterPosition - snapped));
    }
    phaseFitTotal += Math.max(0, 1 - distance / Math.max(baseStep * 0.5, 0.06));
  }
  const phaseFit = groups.length === 0 ? 0 : phaseFitTotal / groups.length;
  const directSupport = maxDirectSupport <= 0 ? 0 : candidate.directSupport / maxDirectSupport;
  const score = 0.55 * intervalFit + 0.25 * phaseFit + 0.15 * support + 0.05 * directSupport;

  return Object.freeze({
    bpm: candidate.bpm,
    score: Number(score.toFixed(6)),
    intervalFit: Number(intervalFit.toFixed(6)),
    phaseFit: Number(phaseFit.toFixed(6)),
    support: Number(support.toFixed(6)),
    directSupport: candidate.directSupport,
  });
}

function ratioNear(left, right, target, tolerance = 0.035) {
  if (left <= 0 || right <= 0) return false;
  return Math.abs(left / right - target) <= tolerance;
}

function warning(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

export function analyzeTempoCandidates(rawEvents, optionsInput = {}) {
  const options = normalizeOptions(optionsInput);
  const events = normalizeEvents(rawEvents);
  const attackGroups = groupAttacks(events, options.onsetMergeToleranceSeconds);
  const intervalsSeconds = intervalList(attackGroups);
  const admittedRhythms = rhythmValues(options);

  if (intervalsSeconds.length < 2) {
    return Object.freeze({
      schemaVersion: 'tempo-candidate-analysis-v0.1',
      analyzerVersion: TEMPO_CANDIDATE_ANALYZER_VERSION,
      authority: TEMPO_CANDIDATE_AUTHORITY,
      status: 'INSUFFICIENT_EVIDENCE',
      options,
      attackGroups,
      intervalsSeconds,
      candidates: Object.freeze([]),
      recommendedBpmHint: null,
      confidence: 0,
      heuristicReady: false,
      guidanceRequired: true,
      ambiguity: Object.freeze({ halfDouble: false, rivalBpms: Object.freeze([]) }),
      warnings: Object.freeze([warning(
        'TEMPO_INSUFFICIENT_ATTACKS',
        'Too few distinct attacks are available to rank tempo candidates safely.',
        { attackGroupCount: attackGroups.length },
      )]),
    });
  }

  const generated = buildCandidateBpms(intervalsSeconds, options, admittedRhythms);
  const maxDirectSupport = generated.reduce((best, item) => Math.max(best, item.directSupport), 0);
  const ranked = generated
    .map((candidate) => scoreCandidate(candidate, attackGroups, intervalsSeconds, options, admittedRhythms, maxDirectSupport))
    .sort((a, b) => b.score - a.score || Math.abs(a.bpm - 120) - Math.abs(b.bpm - 120) || a.bpm - b.bpm)
    .slice(0, options.maxCandidates)
    .map((candidate, index) => Object.freeze({ rank: index + 1, ...candidate }));

  const top = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const evidenceStrength = Math.min(1, intervalsSeconds.length / 8);
  const separation = top === null ? 0 : Math.max(0, top.score - (second?.score ?? 0));
  const separationStrength = Math.min(1, separation / 0.12);
  let confidence = top === null ? 0 : top.score * (0.45 + 0.55 * evidenceStrength) * (0.35 + 0.65 * separationStrength);

  const rivalBpms = top === null ? [] : ranked
    .slice(1)
    .filter((candidate) => candidate.score >= top.score - 0.045 && (
      ratioNear(candidate.bpm, top.bpm, 2) || ratioNear(candidate.bpm, top.bpm, 0.5)
    ))
    .map((candidate) => candidate.bpm);
  const halfDouble = rivalBpms.length > 0;
  if (halfDouble) confidence = Math.min(confidence, 0.69);
  confidence = Number(Math.max(0, Math.min(1, confidence)).toFixed(6));

  const warnings = [];
  if (halfDouble) warnings.push(warning(
    'TEMPO_HALF_DOUBLE_AMBIGUITY',
    'Near-equal half/double tempo candidates remain plausible from onset timing alone.',
    { recommendedBpmHint: top?.bpm ?? null, rivalBpms },
  ));
  if (confidence < 0.8) warnings.push(warning(
    'TEMPO_LOW_CONFIDENCE',
    'Tempo candidate evidence is not strong enough for automatic timing authority.',
    { confidence },
  ));

  return Object.freeze({
    schemaVersion: 'tempo-candidate-analysis-v0.1',
    analyzerVersion: TEMPO_CANDIDATE_ANALYZER_VERSION,
    authority: TEMPO_CANDIDATE_AUTHORITY,
    status: ranked.length === 0 ? 'INSUFFICIENT_EVIDENCE' : 'CANDIDATES_READY',
    options,
    attackGroups,
    intervalsSeconds,
    candidates: Object.freeze(ranked),
    recommendedBpmHint: top?.bpm ?? null,
    confidence,
    heuristicReady: top !== null && confidence >= 0.8 && !halfDouble,
    guidanceRequired: top === null || confidence < 0.8 || halfDouble,
    ambiguity: Object.freeze({ halfDouble, rivalBpms: Object.freeze(rivalBpms) }),
    warnings: Object.freeze(warnings),
  });
}
