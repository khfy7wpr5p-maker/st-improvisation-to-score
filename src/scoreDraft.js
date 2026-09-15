import {
  ImprovisationToScoreError,
  createTranscriptionContext,
  measureLengthQuarter,
  rational,
  rationalToNumber,
} from './contracts.js';
import { quantizePerformance } from './rhythmQuantizer.js';

function subtract(a, b) {
  return rational(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator);
}

function add(a, b) {
  return rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

function scale(a, factor) {
  return rational(a.numerator * factor, a.denominator);
}

function compare(a, b) {
  return a.numerator * b.denominator - b.numerator * a.denominator;
}

function maxRational(values) {
  return values.reduce((best, value) => compare(value, best) > 0 ? value : best);
}

function groupSameOnset(events) {
  const groups = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (previous && compare(previous.onsetQuarter, event.onsetQuarter) === 0) previous.events.push(event);
    else groups.push({ onsetQuarter: event.onsetQuarter, events: [event] });
  }
  return groups;
}

function diagnostic(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function buildMeasure(index, events, measureLength) {
  const measureStart = scale(measureLength, index);
  const measureEnd = add(measureStart, measureLength);
  const localEvents = events
    .filter((event) => compare(event.onsetQuarter, measureStart) >= 0 && compare(event.onsetQuarter, measureEnd) < 0)
    .map((event) => Object.freeze({ ...event, onsetInMeasure: subtract(event.onsetQuarter, measureStart) }));
  const groups = groupSameOnset(localEvents);
  const output = [];
  const diagnostics = [];
  let cursor = rational(0, 1);
  let sawOverlap = false;

  for (const group of groups) {
    const localOnset = group.events[0].onsetInMeasure;
    if (compare(localOnset, cursor) > 0) {
      output.push(Object.freeze({ type: 'rest', onsetQuarter: cursor, durationQuarter: subtract(localOnset, cursor) }));
    } else if (compare(localOnset, cursor) < 0) {
      sawOverlap = true;
      diagnostics.push(diagnostic(
        'POLYPHONIC_OVERLAP_REQUIRES_REVIEW',
        'An attack begins before the prior sounding group ends; Stage 00 does not invent a voice assignment.',
        { measureIndex: index, eventIds: group.events.map((event) => event.eventId) },
      ));
    }

    const groupDuration = maxRational(group.events.map((event) => event.durationQuarter));
    const absoluteEnd = add(group.events[0].onsetQuarter, groupDuration);
    if (compare(absoluteEnd, measureEnd) > 0) {
      diagnostics.push(diagnostic(
        'CROSS_MEASURE_NOTE_REQUIRES_TIE_RECONSTRUCTION',
        'A quantized note crosses the measure boundary; Stage 00 preserves it for review and does not invent a tie.',
        { measureIndex: index, eventIds: group.events.map((event) => event.eventId) },
      ));
    }

    if (group.events.length === 1) {
      const event = group.events[0];
      output.push(Object.freeze({
        type: 'note',
        eventId: event.eventId,
        midiPitch: event.midiPitch,
        onsetQuarter: localOnset,
        durationQuarter: event.durationQuarter,
        confidence: event.confidence,
        sourceOnsetSeconds: event.sourceOnsetSeconds,
        sourceDurationSeconds: event.sourceDurationSeconds,
      }));
    } else {
      output.push(Object.freeze({
        type: 'chord',
        onsetQuarter: localOnset,
        durationQuarter: groupDuration,
        notes: Object.freeze(group.events.map((event) => Object.freeze({
          eventId: event.eventId,
          midiPitch: event.midiPitch,
          durationQuarter: event.durationQuarter,
          confidence: event.confidence,
        }))),
      }));
    }

    const localEnd = add(localOnset, groupDuration);
    if (compare(localEnd, cursor) > 0) cursor = localEnd;
  }

  if (compare(cursor, measureLength) < 0) {
    output.push(Object.freeze({ type: 'rest', onsetQuarter: cursor, durationQuarter: subtract(measureLength, cursor) }));
  }

  return Object.freeze({
    measureIndex: index,
    events: Object.freeze(output),
    diagnostics: Object.freeze(diagnostics),
    reviewRequired: sawOverlap || diagnostics.length > 0,
  });
}

export function buildScoreDraft(rawEvents, contextInput) {
  const context = createTranscriptionContext(contextInput);
  const quantized = quantizePerformance(rawEvents, context);
  const measureLength = measureLengthQuarter(context);
  const measureLengthNumber = rationalToNumber(measureLength);
  if (measureLengthNumber <= 0) throw new ImprovisationToScoreError('INVALID_MEASURE_LENGTH', 'Derived measure length must be positive.');

  let maxEnd = 0;
  for (const event of quantized) {
    maxEnd = Math.max(maxEnd, rationalToNumber(event.onsetQuarter) + rationalToNumber(event.durationQuarter));
  }
  const measureCount = Math.max(1, Math.ceil(maxEnd / measureLengthNumber));
  const measures = [];
  const diagnostics = [];
  for (let index = 0; index < measureCount; index += 1) {
    const measure = buildMeasure(index, quantized, measureLength);
    measures.push(measure);
    diagnostics.push(...measure.diagnostics);
  }

  return Object.freeze({
    schemaVersion: 'score-draft-v0.1',
    status: diagnostics.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
    context,
    measureLengthQuarter: measureLength,
    quantizedEvents: quantized,
    measures: Object.freeze(measures),
    diagnostics: Object.freeze(diagnostics),
  });
}
