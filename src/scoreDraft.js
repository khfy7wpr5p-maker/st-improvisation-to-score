import {
  ImprovisationToScoreError,
  createTranscriptionContext,
  rational,
} from './contracts.js';
import { finalizeQuantizedPerformance } from './rhythmQuantizer.js';
import { materializePolyphonicScore } from './polyphony/materialize.js';
import { analyzeSonoritySpans } from './polyphony/sonority.js';
import { analyzeVoiceCandidates } from './polyphony/voiceCandidates.js';
import { buildMeasureTopology } from './timing/measureTopology.js';
import {
  createConstantTimingMapFromContext,
  createTimingMap,
} from './timing/timingMap.js';
import { quantizePerformanceWithTimingMap } from './timing/timingMapQuantizer.js';

function subtract(a, b) {
  return rational(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator);
}

function add(a, b) {
  return rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
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

function eventEnd(event) {
  return add(event.onsetQuarter, event.durationQuarter);
}

function maxEndQuarter(events) {
  let best = rational(0, 1);
  for (const event of events) {
    const end = eventEnd(event);
    if (compare(end, best) > 0) best = end;
  }
  return best;
}

function normalizedMinimumEnd(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ImprovisationToScoreError('INVALID_MINIMUM_SCORE_EXTENT', 'minimumEndQuarter must be a rational object.');
  }
  const normalized = rational(value.numerator, value.denominator);
  if (normalized.numerator < 0) {
    throw new ImprovisationToScoreError('INVALID_MINIMUM_SCORE_EXTENT', 'minimumEndQuarter must be non-negative.');
  }
  return normalized;
}

function globalSilenceRests(measure, events) {
  const coverage = [];
  for (const event of events) {
    const end = eventEnd(event);
    const start = maxRational(event.onsetQuarter, measure.startQuarter);
    const clippedEnd = minRational(end, measure.endQuarter);
    if (compare(clippedEnd, start) <= 0) continue;
    coverage.push({
      start: subtract(start, measure.startQuarter),
      end: subtract(clippedEnd, measure.startQuarter),
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
  if (compare(cursor, measure.lengthQuarter) < 0) {
    rests.push(Object.freeze({
      type: 'rest',
      scope: 'GLOBAL_SILENCE',
      onsetQuarter: cursor,
      durationQuarter: subtract(measure.lengthQuarter, cursor),
    }));
  }
  return rests;
}

function buildMeasure(measure, events) {
  const localAttacks = events
    .filter((event) => compare(event.onsetQuarter, measure.startQuarter) >= 0 && compare(event.onsetQuarter, measure.endQuarter) < 0)
    .map((event) => Object.freeze({ ...event, onsetInMeasure: subtract(event.onsetQuarter, measure.startQuarter) }));
  const groups = groupSameOnset(localAttacks);
  const attacks = [];

  for (const group of groups) {
    const localOnset = group.events[0].onsetInMeasure;
    const groupDuration = maxRationalList(group.events.map((event) => event.durationQuarter));
    const crossesMeasureBoundary = group.events.some((event) => compare(eventEnd(event), measure.endQuarter) > 0);

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

  const rests = globalSilenceRests(measure, events);
  const output = [...attacks, ...rests].sort((a, b) => {
    const onsetCompare = compare(a.onsetQuarter, b.onsetQuarter);
    if (onsetCompare !== 0) return onsetCompare;
    if (a.type === b.type) return 0;
    return a.type === 'rest' ? 1 : -1;
  });

  return Object.freeze({
    measureIndex: measure.measureIndex,
    startQuarter: measure.startQuarter,
    endQuarter: measure.endQuarter,
    lengthQuarter: measure.lengthQuarter,
    nominalLengthQuarter: measure.nominalLengthQuarter,
    meterNumerator: measure.meterNumerator,
    meterDenominator: measure.meterDenominator,
    meterChangeAtStart: measure.meterChangeAtStart,
    implicit: measure.implicit,
    isPickup: measure.isPickup,
    boundaryReason: measure.boundaryReason,
    events: Object.freeze(output),
    diagnostics: Object.freeze([]),
    reviewRequired: false,
  });
}

function applyVoiceHintOverrides(voiceCandidates, overrides) {
  if (!(overrides instanceof Map) || overrides.size === 0) return voiceCandidates;
  const hints = voiceCandidates.eventVoiceHints.map((hint) => {
    const override = overrides.get(hint.eventId);
    if (override === undefined) return hint;
    return Object.freeze({
      ...hint,
      preferredVoiceId: override,
      authority: 'TEACHER_CONFIRMED',
      ambiguous: false,
    });
  });
  const voiceIds = new Set(hints.map((hint) => hint.preferredVoiceId));
  return Object.freeze({
    ...voiceCandidates,
    eventVoiceHints: Object.freeze(hints),
    voiceCountHint: voiceIds.size,
    teacherVoiceOverrideCount: [...overrides.keys()].filter((eventId) => hints.some((hint) => hint.eventId === eventId)).length,
  });
}

function assembleScoreDraft(quantizedInput, context, timingMap, options = {}) {
  const quantized = finalizeQuantizedPerformance([...quantizedInput]);
  let maxEnd = maxEndQuarter(quantized);
  const minimumEnd = normalizedMinimumEnd(options.minimumEndQuarter);
  if (minimumEnd !== null && compare(minimumEnd, maxEnd) > 0) maxEnd = minimumEnd;

  const measureTopology = buildMeasureTopology(timingMap, maxEnd, {
    pickupLengthQuarter: options.pickupLengthQuarter,
    maxMeasures: options.maxMeasures,
  });
  const polyphony = analyzeSonoritySpans(quantized);
  const inferredVoiceCandidates = analyzeVoiceCandidates(quantized);
  const voiceCandidates = applyVoiceHintOverrides(inferredVoiceCandidates, options.voiceHintOverrides);
  const polyphonicProjection = materializePolyphonicScore(quantized, voiceCandidates, context, { measureTopology });
  const measures = Object.freeze(measureTopology.measures.map((measure) => buildMeasure(measure, quantized)));
  const warnings = Object.freeze([...measureTopology.warnings, ...polyphonicProjection.warnings]);

  return Object.freeze({
    schemaVersion: 'score-draft-v0.7',
    status: 'PASS',
    polyphonyPolicy: 'POLYPHONY_IS_DEFAULT',
    context,
    timingMap,
    measureTopology,
    measureLengthQuarter: measureTopology.measures[0].nominalLengthQuarter,
    quantizedEvents: quantized,
    polyphony,
    voiceCandidates,
    polyphonicProjection,
    measures,
    diagnostics: Object.freeze([]),
    warnings,
  });
}

export function buildScoreDraftFromQuantizedEvents(quantizedEvents, contextInput, options = {}) {
  if (!Array.isArray(quantizedEvents)) {
    throw new ImprovisationToScoreError('INVALID_EVENT_LIST', 'quantizedEvents must be an array.');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new ImprovisationToScoreError('INVALID_SCORE_DRAFT_OPTIONS', 'Score draft options must be a plain object.');
  }
  const context = createTranscriptionContext(contextInput);
  const timingMap = options.timingMap === undefined
    ? createConstantTimingMapFromContext(context, options.timingMapMetadata ?? {})
    : createTimingMap(options.timingMap);
  return assembleScoreDraft(quantizedEvents, context, timingMap, options);
}

export function buildScoreDraft(rawEvents, contextInput, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new ImprovisationToScoreError('INVALID_SCORE_DRAFT_OPTIONS', 'Score draft options must be a plain object.');
  }
  const context = createTranscriptionContext(contextInput);
  const timingMap = options.timingMap === undefined
    ? createConstantTimingMapFromContext(context, options.timingMapMetadata ?? {})
    : createTimingMap(options.timingMap);
  const quantized = quantizePerformanceWithTimingMap(rawEvents, context, timingMap);
  return assembleScoreDraft(quantized, context, timingMap, options);
}
