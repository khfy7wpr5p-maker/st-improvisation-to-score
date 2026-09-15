import {
  ImprovisationToScoreError,
  measureLengthQuarter,
  rational,
} from '../contracts.js';
import { buildMeasureTopology } from '../timing/measureTopology.js';
import { createConstantTimingMapFromContext } from '../timing/timingMap.js';

export const POLYPHONIC_MATERIALIZER_VERSION = '0.2.0';
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

function minRational(a, b) {
  return compare(a, b) <= 0 ? a : b;
}

function maxRational(a, b) {
  return compare(a, b) >= 0 ? a : b;
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

function normalizeTopology(topology) {
  if (!topology || !Array.isArray(topology.measures) || topology.measures.length === 0) {
    fail('INVALID_MEASURE_TOPOLOGY', 'A non-empty measure topology is required.');
  }
  topology.measures.forEach((measure, index) => {
    if (measure.measureIndex !== index || !measure.startQuarter || !measure.endQuarter || !measure.lengthQuarter) {
      fail('INVALID_MEASURE_TOPOLOGY', 'Measure topology entries must be contiguous and carry rational boundaries.', { index });
    }
    if (compare(measure.endQuarter, measure.startQuarter) <= 0 || compare(measure.lengthQuarter, rational(0, 1)) <= 0) {
      fail('INVALID_MEASURE_TOPOLOGY', 'Measure topology entries must have positive length.', { index });
    }
    if (index > 0 && compare(topology.measures[index - 1].endQuarter, measure.startQuarter) !== 0) {
      fail('INVALID_MEASURE_TOPOLOGY', 'Measure topology boundaries must be contiguous.', { index });
    }
  });
  return topology;
}

function findMeasureForPosition(measureTopology, positionQuarter) {
  for (const measure of measureTopology.measures) {
    if (compare(positionQuarter, measure.startQuarter) >= 0 && compare(positionQuarter, measure.endQuarter) < 0) return measure;
  }
  return null;
}

function splitEventIntoMeasures(event, voiceHint, measureTopology, segmentBudget) {
  const end = eventEnd(event);
  const segments = [];
  let cursor = event.onsetQuarter;
  let segmentIndex = 0;

  while (compare(cursor, end) < 0) {
    if (segmentBudget.count >= POLYPHONIC_MATERIALIZER_MAX_SEGMENTS) {
      fail('POLYPHONIC_SEGMENT_LIMIT_EXCEEDED', 'Projection segment count exceeds the resource-safety envelope.', {
        limit: POLYPHONIC_MATERIALIZER_MAX_SEGMENTS,
      });
    }

    const measure = findMeasureForPosition(measureTopology, cursor);
    if (!measure) {
      fail('MEASURE_TOPOLOGY_DOES_NOT_COVER_EVENT', 'Measure topology does not cover a projected event.', {
        eventId: event.eventId,
        cursor,
      });
    }
    const segmentEnd = minRational(end, measure.endQuarter);
    const durationQuarter = subtract(segmentEnd, cursor);
    if (durationQuarter.numerator <= 0) {
      fail('INVALID_PROJECTED_SEGMENT', 'Projected segment duration must be positive.', { eventId: event.eventId, measureIndex: measure.measureIndex });
    }

    segments.push(Object.freeze({
      segmentId: `${event.eventId}:S${segmentIndex + 1}`,
      sourceEventId: event.eventId,
      voiceId: voiceHint.preferredVoiceId,
      voiceAuthority: voiceHint.authority ?? 'NON_CANONICAL_HINT',
      voiceAmbiguous: voiceHint.ambiguous === true,
      midiPitch: event.midiPitch,
      measureIndex: measure.measureIndex,
      onsetInMeasure: subtract(cursor, measure.startQuarter),
      durationQuarter,
      tieFromPrevious: segmentIndex > 0,
      tieToNext: compare(segmentEnd, end) < 0,
      sourceOnsetQuarter: event.onsetQuarter,
      sourceDurationQuarter: event.durationQuarter,
    }));

    segmentBudget.count += 1;
    segmentIndex += 1;
    cursor = segmentEnd;
  }

  return segments;
}

function materializeRestsForMeasure(voiceId, measure, noteSegments) {
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
        restId: `${voiceId}:M${measure.measureIndex + 1}:R${rests.length + 1}`,
        voiceId,
        measureIndex: measure.measureIndex,
        onsetInMeasure: cursor,
        durationQuarter: subtract(segment.onsetInMeasure, cursor),
        scope: 'VOICE_GAP',
      }));
    }
    const end = add(segment.onsetInMeasure, segment.durationQuarter);
    cursor = maxRational(cursor, end);
  }

  if (compare(cursor, measure.lengthQuarter) < 0) {
    rests.push(Object.freeze({
      restId: `${voiceId}:M${measure.measureIndex + 1}:R${rests.length + 1}`,
      voiceId,
      measureIndex: measure.measureIndex,
      onsetInMeasure: cursor,
      durationQuarter: subtract(measure.lengthQuarter, cursor),
      scope: 'VOICE_GAP',
    }));
  }

  return Object.freeze(rests);
}

function materializeVoices(segments, measureTopology) {
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
        const topologyMeasure = measureTopology.measures[measureIndex];
        if (!topologyMeasure) fail('MEASURE_TOPOLOGY_DOES_NOT_COVER_VOICE', 'Voice projection references a missing measure.', { voiceId, measureIndex });
        const notes = Object.freeze([...(measureMap.get(measureIndex) ?? [])].sort((a, b) =>
          compare(a.onsetInMeasure, b.onsetInMeasure) || a.midiPitch - b.midiPitch || a.segmentId.localeCompare(b.segmentId)
        ));
        const rests = materializeRestsForMeasure(voiceId, topologyMeasure, notes);
        measures.push(Object.freeze({
          measureIndex,
          lengthQuarter: topologyMeasure.lengthQuarter,
          meterNumerator: topologyMeasure.meterNumerator,
          meterDenominator: topologyMeasure.meterDenominator,
          notes,
          rests,
        }));
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

export function materializePolyphonicScore(quantizedEvents, voiceCandidates, context, options = {}) {
  if (!Array.isArray(quantizedEvents)) fail('INVALID_QUANTIZED_EVENT_LIST', 'quantizedEvents must be an array.');
  if (options === null || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_POLYPHONIC_MATERIALIZER_OPTIONS', 'options must be a plain object.');
  const hintMap = buildHintMap(voiceCandidates);
  const fallbackMeasureLength = measureLengthQuarter(context);
  const measureTopology = normalizeTopology(options.measureTopology ?? buildMeasureTopology(
    createConstantTimingMapFromContext(context),
    maxEndQuarter(quantizedEvents),
  ));
  const segmentBudget = { count: 0 };
  const segments = [];

  for (let index = 0; index < quantizedEvents.length; index += 1) {
    const event = quantizedEvents[index];
    validateQuantizedEvent(event, index);
    const hint = hintMap.get(event.eventId);
    if (!hint) {
      fail('VOICE_HINT_MISSING_FOR_EVENT', 'Every projected event requires a voice hint.', { eventId: event.eventId });
    }
    segments.push(...splitEventIntoMeasures(event, hint, measureTopology, segmentBudget));
  }

  const voices = quantizedEvents.length === 0 ? Object.freeze([]) : materializeVoices(segments, measureTopology);
  const tieCandidateCount = segments.filter((segment) => segment.tieToNext).length;
  const restCount = voices.reduce((sum, voice) => sum + voice.measures.reduce((inner, measure) => inner + measure.rests.length, 0), 0);

  return Object.freeze({
    schemaVersion: 'polyphonic-score-projection-v0.2',
    materializerVersion: POLYPHONIC_MATERIALIZER_VERSION,
    authority: 'REVERSIBLE_HEURISTIC_PROJECTION',
    policy: 'POLYPHONY_IS_DEFAULT',
    measureLengthQuarter: measureTopology.measures[0]?.nominalLengthQuarter ?? fallbackMeasureLength,
    measureTopology,
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
