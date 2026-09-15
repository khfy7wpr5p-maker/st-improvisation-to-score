import {
  ImprovisationToScoreError,
  createRawPerformanceEvent,
  createTranscriptionContext,
  rational,
  rationalToNumber,
} from './contracts.js';

function candidateKey(value) {
  return `${value.numerator}/${value.denominator}`;
}

function addCandidate(map, value) {
  if (value.numerator < 0) return;
  map.set(candidateKey(value), value);
}

function nearbyMultiples(rawQuarter, stepNumerator, stepDenominator, { allowZero }) {
  const step = stepNumerator / stepDenominator;
  const center = Math.round(rawQuarter / step);
  const out = [];
  for (let delta = -2; delta <= 2; delta += 1) {
    const multiple = center + delta;
    if (multiple < 0 || (!allowZero && multiple === 0)) continue;
    out.push(rational(multiple * stepNumerator, stepDenominator));
  }
  return out;
}

function chooseClosest(rawQuarter, candidates) {
  if (candidates.length === 0) {
    throw new ImprovisationToScoreError('NO_QUANTIZATION_CANDIDATE', 'No admitted quantization candidate was generated.');
  }
  return [...candidates].sort((a, b) => {
    const aValue = rationalToNumber(a);
    const bValue = rationalToNumber(b);
    const errorDelta = Math.abs(aValue - rawQuarter) - Math.abs(bValue - rawQuarter);
    if (Math.abs(errorDelta) > 1e-12) return errorDelta;
    return aValue - bValue;
  })[0];
}

export function secondsToQuarterNotes(seconds, bpm) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    throw new ImprovisationToScoreError('INVALID_SECONDS', 'seconds must be finite and >= 0.');
  }
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) {
    throw new ImprovisationToScoreError('INVALID_BPM', 'bpm must be finite and > 0.');
  }
  return seconds * bpm / 60;
}

function quantizeValue(rawQuarter, context, { allowZero }) {
  const candidates = new Map();
  const regularStepNumerator = 4;
  const regularStepDenominator = context.smallestNoteDenominator;
  for (const value of nearbyMultiples(rawQuarter, regularStepNumerator, regularStepDenominator, { allowZero })) {
    addCandidate(candidates, value);
  }
  if (context.allowTriplets) {
    // Stage 00 admits eighth-note-triplet spacing: 1/3 quarter note.
    for (const value of nearbyMultiples(rawQuarter, 1, 3, { allowZero })) addCandidate(candidates, value);
  }
  return chooseClosest(rawQuarter, [...candidates.values()]);
}

export function quantizePerformanceEvent(rawInput, contextInput) {
  const raw = createRawPerformanceEvent(rawInput);
  const context = createTranscriptionContext(contextInput);
  const rawOnsetQuarter = secondsToQuarterNotes(raw.onsetSeconds, context.bpm);
  const rawDurationQuarter = secondsToQuarterNotes(raw.offsetSeconds - raw.onsetSeconds, context.bpm);
  const onsetQuarter = quantizeValue(rawOnsetQuarter, context, { allowZero: true });
  const durationQuarter = quantizeValue(rawDurationQuarter, context, { allowZero: false });
  const snappedOnset = rationalToNumber(onsetQuarter);
  const snappedDuration = rationalToNumber(durationQuarter);
  if (snappedDuration <= 0) {
    throw new ImprovisationToScoreError('NON_POSITIVE_QUANTIZED_DURATION', 'Quantized duration must be positive.', { eventId: raw.eventId });
  }
  return Object.freeze({
    eventId: raw.eventId,
    midiPitch: raw.midiPitch,
    sourceOnsetSeconds: raw.onsetSeconds,
    sourceDurationSeconds: raw.offsetSeconds - raw.onsetSeconds,
    onsetQuarter,
    durationQuarter,
    confidence: raw.confidence,
    amplitude: raw.amplitude,
    sourceEventId: raw.sourceEventId,
    quantizationErrorQuarter: Object.freeze({
      onset: snappedOnset - rawOnsetQuarter,
      duration: snappedDuration - rawDurationQuarter,
    }),
  });
}

export function quantizePerformance(rawEvents, contextInput) {
  if (!Array.isArray(rawEvents)) throw new ImprovisationToScoreError('INVALID_EVENT_LIST', 'rawEvents must be an array.');
  const context = createTranscriptionContext(contextInput);
  const ids = new Set();
  const quantized = rawEvents.map((event) => {
    const result = quantizePerformanceEvent(event, context);
    if (ids.has(result.eventId)) {
      throw new ImprovisationToScoreError('DUPLICATE_EVENT_ID', 'eventId values must be unique.', { eventId: result.eventId });
    }
    ids.add(result.eventId);
    return result;
  });
  return Object.freeze(quantized.sort((a, b) =>
    rationalToNumber(a.onsetQuarter) - rationalToNumber(b.onsetQuarter) ||
    a.midiPitch - b.midiPitch ||
    a.eventId.localeCompare(b.eventId)
  ));
}
