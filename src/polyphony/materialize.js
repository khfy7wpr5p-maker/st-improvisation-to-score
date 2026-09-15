import {
  ImprovisationToScoreError,
  measureLengthQuarter,
  rational,
} from '../contracts.js';

export const POLYPHONIC_MATERIALIZER_VERSION = '0.1.0';
export const POLYPHONIC_MATERIALIZER_MAX_SEGMENTS = 1_000_000;

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function compare(a, b) {
  return a.numerator * b.denominator - b.numerator * a.denominator;
}

function add(a, b) {
  return rational(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}

function subtract(a, b) {
  return rational(
    a.numerator * b.denominator - b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}

function scale(value, factor) {
  return rational(value.numerator * factor, value.denominator);
}

function minRational(a, b) {
  return compare(a, b) <= 0 ? a : b;
}

function maxRational(a, b) {
  return compare(a, b) >= 0 ? a : b;
}

function floorMeasureIndex(position, measureLength) {
  const numerator = BigInt(position.numerator) * BigInt(measureLength.denominator);
  const denominator = BigInt(position.denominator) * BigInt(measureLength.numerator);
  if (denominator <= 0n) fail('INVALID_MEASURE_LENGTH', 'Measure length must be positive.');
  const value = numerator / denominator;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('MEASURE_INDEX_OUT_OF_RANGE', 'Derived measure index exceeds the supported numeric envelope.');
  }
  return Number(value);
}

function validateQuantizedEvent(event, index) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    fail('INVALID_QUANTIZED_EVENT', 'Quantized event must be an object.', { index });
  }
  if (typeof event.eventId !== 'string' || !event.eventId) {
    fail('INVALID_QUANTIZED_EVENT', 'Quantized event requires eventId.', { index });
  }
  if (!Number.isInteger(event.midiPitch) || event.midiPitch < 0 || event.midiPitch > 127) {
    fail('INVALID_QUANTIZED_EVENT', 'midiPitch must be an integer in 0..127.', { index });
  }
  if (!event.onsetQuarter || !event.durationQuarter || event.durationQuarter.numerator <= 0) {
    fail('INVALID_QUANTIZED_EVENT', 'Quantized event requires positive rational timing.', { index });
  }
}

function buildHintMap(voiceCandidates) {
  if (!voiceCandidates || !Array.isArray(voiceCandidates.eventVoiceHints)) {
    fail('INVALID_VOICE_CANDIDATE_ANALYSIS', 'voiceCandidates.eventVoiceHints is required.');
  }
  const map = new Map();
  for (const hint of voiceCandidates.eventVoiceHints) {
    if (map.has(hint.eventId)) fail('DUPLICATE_VOICE_HINT', 'Each event may have only one preferred voice hint.', { eventId: hint.eventId });
    map.set(hint.eventId, hint);
  }
  return map;
}

function splitEventIntoMeasures(event, voiceHint, measureLength, segmentBudget) {
  const eventEnd = add(event.onsetQuarter, event.durationQuarter);
  const segments = [];
  let cursor = event.onsetQuarter;
  let segmentIndex = 0;

  while (compare(cursor, eventEnd) < 0) {
    if (segmentBudget.count >= POLYPHONIC_MATERIALIZER_MAX_SEGMENTS) {
      fail('POLYPHONIC_SEGMENT_LIMIT_EXCEEDED', 'Projection segment count exceeds the resource-safety envelope.', {
        limit: POLYPHONIC_MATERIALIZER_MAX_SEGMENTS,
      });
    }

    const measureIndex = floorMeasureIndex(cursor, measureLength);
    const measureStart = scale(measureLength, measureIndex);
    const measureEnd = add(measureStart, measureLength);
    const segmentEnd = minRational(eventEnd, measureEnd);
    const durationQuarter = subtract(segmentEnd, cursor);

    if (durationQuarter.numerator <= 0) {
      fail('INVALID_PROJECTED_SEGMENT', 'Projected segment duration must be positive.', { eventId: event.eventId, measureIndex });
    }

    segments.push(Object.freeze({
      segmentId: `${event.eventId}:S${segmentIndex + 1}`,
      sourceEventId: event.eventId,
      voiceId: voiceHint.preferredVoiceId,
      voiceAuthority: voiceHint.authority ?? 'NON_CANONICAL_HINT',
      voiceAmbiguous: voiceHint.ambiguous === true,
      midiPitch: event.midiPitch,
      measureIndex,
      onsetInMeasure: subtract(cursor, measureStart),
      durationQuarter,
      tieFromPrevious: segmentIndex > 0,
      tieToNext: compare(segmentEnd, eventEnd) < 0,
      sourceOnsetQuarter: event.onsetQuarter,
      sourceDurationQuarter: event.durationQuarter,
    }));

    segmentBudget.count += 1;
    segmentIndex += 1;
    cursor = segmentEnd;
  }

  return segments;
}

function materializeRestsForMeasure(voiceId, measureIndex, noteSegments, measureLength) {
  const ordered = [...noteSegments].sort((a, b) =>
    compare(a.onsetInMeasure, b.onsetInMeasure) ||
    a.midiPitch - b.midiPitch ||
    a.segmentId.localeCompare(b.segmentId)
  );

  const rests = [];
  let cursor = rational(0, 1);

  for (const segment of ordered) {
    if (compare(segment.onsetInMeasure, cursor) > 0) {
      rests.push(Object.freeze({
        restId: `${voiceId}:M${measureIndex + 1}:R${rests.length + 1}`,
        voiceId,
        measureIndex,
        onsetInMeasure: cursor,
        durationQuarter: subtract(segment.onsetInMeasure, cursor),
        scope: 'VOICE_GAP',
      }));
    }
    const end = add(segment.onsetInMeasure, segment.durationQuarter);
    cursor = maxRational(cursor, end);
  }

  if (compare(cursor, measureLength) < 0) {
    rests.push(Object.freeze({
      restId: `${voiceId}:M${measureIndex + 1}:R${rests.length + 1}`,
      voiceId,
      measureIndex,
      onsetInMeasure: cursor,
      durationQuarter: subtract(measureLength, cursor),
      scope: 'VOICE_GAP',
    }));
  }

  return Object.freeze(rests);
}

function materializeVoices(segments, measureLength) {
  const voiceMap = new Map();
  for (const segment of segments) {
    const list = voiceMap.get(segment.voiceId) ?? [];
    list.push(segment);
    voiceMap.set(segment.voiceId, list);
  }

  return Object.freeze([...voiceMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([voiceId, voiceSegments]) => {
      const measureMap = new Map();
      for (const segment of voiceSegments) {
        const list = measureMap.get(segment.measureIndex) ?? [];
        list.push(segment);
        measureMap.set(segment.measureIndex, list);
      }

      const measureIndexes = [...measureMap.keys()].sort((a, b) => a - b);
      const firstMeasureIndex = measureIndexes[0];
      const lastMeasureIndex = measureIndexes.at(-1);
      const measures = [];

      for (let measureIndex = firstMeasureIndex; measureIndex <= lastMeasureIndex; measureIndex += 1) {
        const notes = Object.freeze([...(measureMap.get(measureIndex) ?? [])].sort((a, b) =>
          compare(a.onsetInMeasure, b.onsetInMeasure) || a.midiPitch - b.midiPitch || a.segmentId.localeCompare(b.segmentId)
        ));
        const rests = materializeRestsForMeasure(voiceId, measureIndex, notes, measureLength);
        measures.push(Object.freeze({ measureIndex, notes, rests }));
      }

      return Object.freeze({
        voiceId,
        authority: 'REVERSIBLE_HEURISTIC_PROJECTION',
        firstMeasureIndex,
        lastMeasureIndex,
        sourceEventIds: Object.freeze([...new Set(voiceSegments.map((segment) => segment.sourceEventId))]),
        segmentCount: voiceSegments.length,
        measures: Object.freeze(measures),
      });
    }));
}

function projectionWarnings(voiceCandidates) {
  const warnings = [];
  for (const assignment of voiceCandidates.assignments ?? []) {
    if (assignment.ambiguous) {
      warnings.push(Object.freeze({
        code: 'AMBIGUOUS_VOICE_CONTINUATION_PRESERVED',
        message: 'A near-equal voice continuation was projected using the preferred hint while alternatives remain available.',
        details: Object.freeze({ attackGroupId: assignment.attackGroupId, eventIds: assignment.eventIds }),
      }));
    }
    if (assignment.mixedDurations) {
      warnings.push(Object.freeze({
        code: 'MIXED_DURATION_CHORD_SPLIT_HINT_PRESERVED',
        message: 'Same-onset notes with different durations remain projected without forcing a destructive voice split.',
        details: Object.freeze({ attackGroupId: assignment.attackGroupId, eventIds: assignment.eventIds }),
      }));
    }
  }
  return Object.freeze(warnings);
}

export function materializePolyphonicScore(quantizedEvents, voiceCandidates, context) {
  if (!Array.isArray(quantizedEvents)) fail('INVALID_QUANTIZED_EVENT_LIST', 'quantizedEvents must be an array.');
  const hintMap = buildHintMap(voiceCandidates);
  const measureLength = measureLengthQuarter(context);
  const segmentBudget = { count: 0 };
  const segments = [];

  for (let index = 0; index < quantizedEvents.length; index += 1) {
    const event = quantizedEvents[index];
    validateQuantizedEvent(event, index);
    const hint = hintMap.get(event.eventId);
    if (!hint) {
      fail('VOICE_HINT_MISSING_FOR_EVENT', 'Every projected event requires a voice hint.', { eventId: event.eventId });
    }
    segments.push(...splitEventIntoMeasures(event, hint, measureLength, segmentBudget));
  }

  const voices = quantizedEvents.length === 0 ? Object.freeze([]) : materializeVoices(segments, measureLength);
  const tieCandidateCount = segments.filter((segment) => segment.tieToNext).length;
  const restCount = voices.reduce((sum, voice) => sum + voice.measures.reduce((inner, measure) => inner + measure.rests.length, 0), 0);

  return Object.freeze({
    schemaVersion: 'polyphonic-score-projection-v0.1',
    materializerVersion: POLYPHONIC_MATERIALIZER_VERSION,
    authority: 'REVERSIBLE_HEURISTIC_PROJECTION',
    policy: 'POLYPHONY_IS_DEFAULT',
    measureLengthQuarter: measureLength,
    sourceEventCount: quantizedEvents.length,
    voiceCount: voices.length,
    segmentCount: segments.length,
    tieCandidateCount,
    restCount,
    segments: Object.freeze(segments),
    voices,
    warnings: projectionWarnings(voiceCandidates),
  });
}
