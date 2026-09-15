import {
  ImprovisationToScoreError,
  createRawPerformanceEvent,
  createTranscriptionContext,
} from '../contracts.js';
import {
  finalizeQuantizedPerformance,
  quantizePerformanceEventFromQuarterValues,
} from '../rhythmQuantizer.js';
import {
  createTimingMap,
  elapsedSecondsToQuarterPosition,
} from './timingMap.js';

export const TIMING_MAP_QUANTIZER_VERSION = '0.1.0';

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function approximatelyEqual(left, right, tolerance = 1e-9) {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

export function validateTimingMapContextCompatibility(contextInput, timingMapInput) {
  const context = createTranscriptionContext(contextInput);
  const timingMap = createTimingMap(timingMapInput);
  const initialTempo = timingMap.tempoChanges[0];
  const initialMeter = timingMap.meterChanges[0];

  if (!approximatelyEqual(initialTempo.bpm, context.bpm)) {
    fail('TIMING_MAP_CONTEXT_TEMPO_MISMATCH', 'Timing-map origin BPM must match transcription-context BPM.', {
      contextBpm: context.bpm,
      timingMapBpm: initialTempo.bpm,
    });
  }
  if (initialMeter.numerator !== context.meterNumerator || initialMeter.denominator !== context.meterDenominator) {
    fail('TIMING_MAP_CONTEXT_METER_MISMATCH', 'Timing-map origin meter must match transcription-context meter.', {
      contextMeter: `${context.meterNumerator}/${context.meterDenominator}`,
      timingMapMeter: `${initialMeter.numerator}/${initialMeter.denominator}`,
    });
  }

  return Object.freeze({ context, timingMap });
}

export function quantizePerformanceWithTimingMap(rawEvents, contextInput, timingMapInput) {
  if (!Array.isArray(rawEvents)) fail('INVALID_EVENT_LIST', 'rawEvents must be an array.');
  const { context, timingMap } = validateTimingMapContextCompatibility(contextInput, timingMapInput);
  const quantized = rawEvents.map((rawInput) => {
    const raw = createRawPerformanceEvent(rawInput);
    const rawOnsetQuarter = elapsedSecondsToQuarterPosition(timingMap, raw.onsetSeconds);
    const rawOffsetQuarter = elapsedSecondsToQuarterPosition(timingMap, raw.offsetSeconds);
    const rawDurationQuarter = rawOffsetQuarter - rawOnsetQuarter;
    if (!Number.isFinite(rawDurationQuarter) || rawDurationQuarter <= 0) {
      fail('NON_POSITIVE_MAPPED_DURATION', 'Timing-map conversion produced a non-positive musical duration.', {
        eventId: raw.eventId,
        rawOnsetQuarter,
        rawOffsetQuarter,
      });
    }
    return quantizePerformanceEventFromQuarterValues(raw, context, rawOnsetQuarter, rawDurationQuarter);
  });
  return finalizeQuantizedPerformance(quantized);
}
