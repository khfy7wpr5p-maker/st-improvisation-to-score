import { ImprovisationToScoreError, rational, rationalToNumber } from '../contracts.js';

export const SONORITY_ANALYZER_VERSION = '0.1.0';
export const SONORITY_MAX_EVENTS = 100_000;

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function compare(a, b) {
  return a.numerator * b.denominator - b.numerator * a.denominator;
}

function add(a, b) {
  return rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

function key(value) {
  return `${value.numerator}/${value.denominator}`;
}

function validateQuantizedEvent(event, index) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    fail('INVALID_QUANTIZED_EVENT', 'Quantized event must be an object.', { index });
  }
  if (typeof event.eventId !== 'string' || !event.eventId || event.eventId.length > 160) {
    fail('INVALID_QUANTIZED_EVENT', 'eventId must be a non-empty bounded string.', { index });
  }
  if (!Number.isInteger(event.midiPitch) || event.midiPitch < 0 || event.midiPitch > 127) {
    fail('INVALID_QUANTIZED_EVENT', 'midiPitch must be an integer in 0..127.', { index });
  }
  for (const [field, value] of [['onsetQuarter', event.onsetQuarter], ['durationQuarter', event.durationQuarter]]) {
    if (value === null || typeof value !== 'object' || !Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator) || value.denominator <= 0) {
      fail('INVALID_QUANTIZED_EVENT', `${field} must be a normalized rational.`, { index, field });
    }
  }
  if (event.onsetQuarter.numerator < 0 || event.durationQuarter.numerator <= 0) {
    fail('INVALID_QUANTIZED_EVENT', 'onset must be non-negative and duration must be positive.', { index });
  }
}

function classifySpan(active, attacks, sustained) {
  if (active.length === 1) return 'MONOPHONIC';
  if (attacks.length === active.length) return 'CHORD_ATTACK';
  if (attacks.length > 0 && sustained.length > 0) return 'SUSTAINED_OVERLAP';
  return 'SUSTAINED_SONORITY';
}

export function analyzeSonoritySpans(quantizedEvents) {
  if (!Array.isArray(quantizedEvents)) fail('INVALID_QUANTIZED_EVENT_LIST', 'quantizedEvents must be an array.');
  if (quantizedEvents.length > SONORITY_MAX_EVENTS) {
    fail('SONORITY_EVENT_LIMIT_EXCEEDED', 'Quantized event count exceeds the admitted sonority-analysis limit.', {
      limit: SONORITY_MAX_EVENTS,
      actual: quantizedEvents.length,
    });
  }

  const ids = new Set();
  const notes = quantizedEvents.map((event, index) => {
    validateQuantizedEvent(event, index);
    if (ids.has(event.eventId)) fail('DUPLICATE_EVENT_ID', 'eventId values must be unique for sonority analysis.', { eventId: event.eventId });
    ids.add(event.eventId);
    return Object.freeze({
      eventId: event.eventId,
      midiPitch: event.midiPitch,
      onsetQuarter: event.onsetQuarter,
      endQuarter: add(event.onsetQuarter, event.durationQuarter),
    });
  });

  const boundaryMap = new Map();
  for (const note of notes) {
    boundaryMap.set(key(note.onsetQuarter), note.onsetQuarter);
    boundaryMap.set(key(note.endQuarter), note.endQuarter);
  }
  const boundaries = [...boundaryMap.values()].sort(compare);
  const spans = [];
  let maxSimultaneousNotes = 0;
  let sustainedOverlapCount = 0;

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startQuarter = boundaries[index];
    const endQuarter = boundaries[index + 1];
    if (compare(endQuarter, startQuarter) <= 0) continue;

    const active = notes
      .filter((note) => compare(note.onsetQuarter, startQuarter) <= 0 && compare(note.endQuarter, startQuarter) > 0)
      .sort((a, b) => a.midiPitch - b.midiPitch || a.eventId.localeCompare(b.eventId));
    if (active.length === 0) continue;

    const attacks = active.filter((note) => compare(note.onsetQuarter, startQuarter) === 0);
    const sustained = active.filter((note) => compare(note.onsetQuarter, startQuarter) < 0);
    const classification = classifySpan(active, attacks, sustained);
    if (classification === 'SUSTAINED_OVERLAP') sustainedOverlapCount += 1;
    maxSimultaneousNotes = Math.max(maxSimultaneousNotes, active.length);

    spans.push(Object.freeze({
      startQuarter,
      endQuarter,
      durationQuarter: rational(
        endQuarter.numerator * startQuarter.denominator - startQuarter.numerator * endQuarter.denominator,
        endQuarter.denominator * startQuarter.denominator,
      ),
      classification,
      activeEventIds: Object.freeze(active.map((note) => note.eventId)),
      attackEventIds: Object.freeze(attacks.map((note) => note.eventId)),
      sustainedEventIds: Object.freeze(sustained.map((note) => note.eventId)),
      midiPitches: Object.freeze(active.map((note) => note.midiPitch)),
    }));
  }

  return Object.freeze({
    schemaVersion: 'sonority-analysis-v0.1',
    analyzerVersion: SONORITY_ANALYZER_VERSION,
    spans: Object.freeze(spans),
    maxSimultaneousNotes,
    sustainedOverlapCount,
    hasSustainedOverlap: sustainedOverlapCount > 0,
    endQuarter: boundaries.length === 0 ? rational(0, 1) : boundaries.at(-1),
    endQuarterNumber: boundaries.length === 0 ? 0 : rationalToNumber(boundaries.at(-1)),
  });
}
