import {
  ImprovisationToScoreError,
  createTranscriptionContext,
  measureLengthQuarter,
  rational,
  rationalToNumber,
} from './contracts.js';
import { materializePolyphonicScore } from './polyphony/materialize.js';
import { analyzeSonoritySpans } from './polyphony/sonority.js';
import { analyzeVoiceCandidates } from './polyphony/voiceCandidates.js';
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

function minRational(a, b) {
  return compare(a, b) <= 0 ? a : b;
}

function maxRational(a, b) {
  return compare(a, b) >= 0 ? a : b;
}

function maxRationalList(values) {
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

function globalSilenceRests(index, events, measureLength) {
  const measureStart = scale(measureLength, index);
  const measureEnd = add(measureStart, measureLength);
  const coverage = [];

  for (const event of events) {
    const eventEnd = add(event.onsetQuarter, event.durationQuarter);
    const start = maxRational(event.onsetQuarter, measureStart);
    const end = minRational(eventEnd, measureEnd);
    if (compare(end, start) <= 0) continue;
    coverage.push({
      start: subtract(start, measureStart),
      end: subtract(end, measureStart),
    });
  }

  coverage.sort((a, b) => compare(a.start, b.start) || compare(a.end, b.end));
  const rests = [];
  let cursor = rational(0, 1);

  for (const interval of coverage) {
    if (compare(interval.start, cursor) > 0) {
      rests.push(Object.freeze({
        type: 'rest',
        scope: 'GLOBAL_SILENCE',
        onsetQuarter: cursor,
        durationQuarter: subtract(interval.start, cursor),
      }));
    }
    cursor = maxRational(cursor, interval.end);
  }

  if (compare(cursor, measureLength) < 0) {
    rests.push(Object.freeze({
      type: 'rest',
      scope: 'GLOBAL_SILENCE',
      onsetQuarter: cursor,
      durationQuarter: subtract(measureLength, cursor),
    }));
  }

  return rests;
}

function buildMeasure(index, events, measureLength) {
  const measureStart = scale(measureLength, index);
  const measureEnd = add(measureStart, measureLength);
  const localAttacks = events
    .filter((event) => compare(event.onsetQuarter, measureStart) >= 0 && compare(event.onsetQuarter, measureEnd) < 0)
    .map((event) => Object.freeze({ ...event, onsetInMeasure: subtract(event.onsetQuarter, measureStart) }));
  const groups = groupSameOnset(localAttacks);
  const attacks = [];

  for (const group of groups) {
    const localOnset = group.events[0].onsetInMeasure;
    const groupDuration = maxRationalList(group.events.map((event) => event.durationQuarter));
    const crossesMeasureBoundary = group.events.some((event) =>
      compare(add(event.onsetQuarter, event.durationQuarter), measureEnd) > 0
    );

    if (group.events.length === 1) {
      const event = group.events[0];
      attacks.push(Object.freeze({
        type: 'note',
        eventId: event.eventId,
        midiPitch: event.midiPitch,
        onsetQuarter: localOnset,
        durationQuarter: event.durationQuarter,
        confidence: event.confidence,
        sourceOnsetSeconds: event.sourceOnsetSeconds,
        sourceDurationSeconds: event.sourceDurationSeconds,
        crossesMeasureBoundary,
      }));
    } else {
      attacks.push(Object.freeze({
        type: 'chord',
        onsetQuarter: localOnset,
        durationQuarter: groupDuration,
        crossesMeasureBoundary,
        notes: Object.freeze(group.events.map((event) => Object.freeze({
          eventId: event.eventId,
          midiPitch: event.midiPitch,
          durationQuarter: event.durationQuarter,
          confidence: event.confidence,
        }))),
      }));
    }
  }

  const rests = globalSilenceRests(index, events, measureLength);
  const output = [...attacks, ...rests].sort((a, b) => {
    const onsetCompare = compare(a.onsetQuarter, b.onsetQuarter);
    if (onsetCompare !== 0) return onsetCompare;
    if (a.type === b.type) return 0;
    return a.type === 'rest' ? 1 : -1;
  });

  return Object.freeze({
    measureIndex: index,
    events: Object.freeze(output),
    diagnostics: Object.freeze([]),
    reviewRequired: false,
  });
}

export function buildScoreDraft(rawEvents, contextInput) {
  const context = createTranscriptionContext(contextInput);
  const quantized = quantizePerformance(rawEvents, context);
  const polyphony = analyzeSonoritySpans(quantized);
  const voiceCandidates = analyzeVoiceCandidates(quantized);
  const polyphonicProjection = materializePolyphonicScore(quantized, voiceCandidates, context);
  const measureLength = measureLengthQuarter(context);
  const measureLengthNumber = rationalToNumber(measureLength);
  if (measureLengthNumber <= 0) throw new ImprovisationToScoreError('INVALID_MEASURE_LENGTH', 'Derived measure length must be positive.');

  let maxEnd = 0;
  for (const event of quantized) {
    maxEnd = Math.max(maxEnd, rationalToNumber(event.onsetQuarter) + rationalToNumber(event.durationQuarter));
  }
  const measureCount = Math.max(1, Math.ceil(maxEnd / measureLengthNumber));
  const measures = [];
  for (let index = 0; index < measureCount; index += 1) {
    measures.push(buildMeasure(index, quantized, measureLength));
  }

  return Object.freeze({
    schemaVersion: 'score-draft-v0.4',
    status: 'PASS',
    polyphonyPolicy: 'POLYPHONY_IS_DEFAULT',
    context,
    measureLengthQuarter: measureLength,
    quantizedEvents: quantized,
    polyphony,
    voiceCandidates,
    polyphonicProjection,
    measures: Object.freeze(measures),
    diagnostics: Object.freeze([]),
    warnings: polyphonicProjection.warnings,
  });
}
