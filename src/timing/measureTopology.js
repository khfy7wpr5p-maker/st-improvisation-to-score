import { ImprovisationToScoreError, rational, rationalToNumber } from '../contracts.js';
import { createTimingMap, effectiveMeterAtQuarter } from './timingMap.js';

export const MEASURE_TOPOLOGY_VERSION = '0.1.0';
export const MEASURE_TOPOLOGY_MAX_MEASURES = 100_000;

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function compare(left, right) {
  const a = BigInt(left.numerator) * BigInt(right.denominator);
  const b = BigInt(right.numerator) * BigInt(left.denominator);
  return a < b ? -1 : a > b ? 1 : 0;
}

function add(left, right) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left, right) {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function normalizePosition(value, field) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) fail('INVALID_MEASURE_TOPOLOGY_POSITION', `${field} must be finite and non-negative.`, { value });
    const denominator = 1_000_000;
    return rational(Math.round(value * denominator), denominator);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_MEASURE_TOPOLOGY_POSITION', `${field} must be a rational or finite number.`);
  const normalized = rational(value.numerator, value.denominator);
  if (normalized.numerator < 0) fail('INVALID_MEASURE_TOPOLOGY_POSITION', `${field} must be non-negative.`);
  return normalized;
}

function nominalMeasureLength(meter) {
  return rational(meter.numerator * 4, meter.denominator);
}

function warning(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function meterChangeAt(timingMap, positionQuarter) {
  return timingMap.meterChanges.find((change) => compare(change.positionQuarter, positionQuarter) === 0) ?? null;
}

function nextMeterChangeAfter(timingMap, positionQuarter) {
  return timingMap.meterChanges.find((change) => compare(change.positionQuarter, positionQuarter) > 0) ?? null;
}

function normalizeOptions(timingMap, input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_MEASURE_TOPOLOGY_OPTIONS', 'Measure-topology options must be a plain object.');
  const maxMeasures = input.maxMeasures ?? MEASURE_TOPOLOGY_MAX_MEASURES;
  if (!Number.isInteger(maxMeasures) || maxMeasures < 1 || maxMeasures > MEASURE_TOPOLOGY_MAX_MEASURES) {
    fail('INVALID_MEASURE_TOPOLOGY_OPTIONS', `maxMeasures must be an integer in 1..${MEASURE_TOPOLOGY_MAX_MEASURES}.`);
  }
  const warnings = [];
  let pickupLengthQuarter = null;
  if (input.pickupLengthQuarter !== undefined && input.pickupLengthQuarter !== null) {
    const candidate = normalizePosition(input.pickupLengthQuarter, 'pickupLengthQuarter');
    const initialMeter = effectiveMeterAtQuarter(timingMap, rational(0, 1));
    const nominal = nominalMeasureLength(initialMeter);
    if (candidate.numerator <= 0) {
      warnings.push(warning('PICKUP_LENGTH_IGNORED', 'A zero pickup length was ignored.'));
    } else if (compare(candidate, nominal) >= 0) {
      warnings.push(warning('PICKUP_NOT_SHORTER_THAN_MEASURE_IGNORED', 'Pickup length must be shorter than the first nominal measure; the score remains fully materialized without a pickup.', {
        pickupLengthQuarter: candidate,
        nominalMeasureLengthQuarter: nominal,
      }));
    } else {
      pickupLengthQuarter = candidate;
    }
  }
  return Object.freeze({ maxMeasures, pickupLengthQuarter, warnings: Object.freeze(warnings) });
}

export function buildMeasureTopology(timingMapInput, maxEndQuarterInput, optionsInput = {}) {
  const timingMap = createTimingMap(timingMapInput);
  const maxEndQuarter = normalizePosition(maxEndQuarterInput, 'maxEndQuarter');
  const options = normalizeOptions(timingMap, optionsInput);
  const measures = [];
  const warnings = [...options.warnings];
  let cursor = rational(0, 1);
  let measureIndex = 0;

  while (measureIndex === 0 || compare(cursor, maxEndQuarter) < 0) {
    if (measureIndex >= options.maxMeasures) {
      fail('MEASURE_TOPOLOGY_LIMIT_EXCEEDED', 'Measure topology exceeds the configured resource-safety limit.', { maxMeasures: options.maxMeasures });
    }

    const meter = effectiveMeterAtQuarter(timingMap, cursor);
    const nominalLengthQuarter = nominalMeasureLength(meter);
    let boundaryReason = 'FULL_MEASURE';
    let targetEnd = add(cursor, nominalLengthQuarter);

    if (measureIndex === 0 && options.pickupLengthQuarter !== null) {
      targetEnd = add(cursor, options.pickupLengthQuarter);
      boundaryReason = 'PICKUP';
    }

    const nextMeterChange = nextMeterChangeAfter(timingMap, cursor);
    if (nextMeterChange !== null && compare(nextMeterChange.positionQuarter, targetEnd) < 0) {
      targetEnd = nextMeterChange.positionQuarter;
      boundaryReason = measureIndex === 0 && options.pickupLengthQuarter !== null
        ? 'PICKUP_TRUNCATED_BY_METER_CHANGE'
        : 'METER_CHANGE_TRUNCATION';
    }

    const lengthQuarter = subtract(targetEnd, cursor);
    if (lengthQuarter.numerator <= 0) {
      fail('INVALID_MEASURE_TOPOLOGY', 'Derived measure length must be positive.', { measureIndex, cursor, targetEnd });
    }

    const changeAtStart = meterChangeAt(timingMap, cursor);
    const implicit = compare(lengthQuarter, nominalLengthQuarter) !== 0;
    measures.push(Object.freeze({
      measureIndex,
      startQuarter: cursor,
      endQuarter: targetEnd,
      lengthQuarter,
      nominalLengthQuarter,
      meterNumerator: meter.numerator,
      meterDenominator: meter.denominator,
      meterSourceAuthority: meter.sourceAuthority,
      meterChangeAtStart: changeAtStart !== null,
      implicit,
      isPickup: boundaryReason === 'PICKUP' || boundaryReason === 'PICKUP_TRUNCATED_BY_METER_CHANGE',
      boundaryReason,
    }));

    cursor = targetEnd;
    measureIndex += 1;
  }

  return Object.freeze({
    schemaVersion: 'measure-topology-v0.1',
    topologyVersion: MEASURE_TOPOLOGY_VERSION,
    maxEndQuarter,
    measureCount: measures.length,
    measures: Object.freeze(measures),
    warnings: Object.freeze(warnings),
  });
}

export function measureAtQuarter(measureTopology, positionInput) {
  if (!measureTopology || !Array.isArray(measureTopology.measures) || measureTopology.measures.length === 0) {
    fail('INVALID_MEASURE_TOPOLOGY', 'measureTopology.measures is required.');
  }
  const positionQuarter = normalizePosition(positionInput, 'positionQuarter');
  for (const measure of measureTopology.measures) {
    if (compare(positionQuarter, measure.startQuarter) >= 0 && compare(positionQuarter, measure.endQuarter) < 0) return measure;
  }
  const finalMeasure = measureTopology.measures.at(-1);
  if (compare(positionQuarter, finalMeasure.endQuarter) === 0) return finalMeasure;
  return null;
}

export function measureTopologyEndQuarter(measureTopology) {
  if (!measureTopology || !Array.isArray(measureTopology.measures) || measureTopology.measures.length === 0) fail('INVALID_MEASURE_TOPOLOGY', 'measureTopology.measures is required.');
  return measureTopology.measures.at(-1).endQuarter;
}

export function describeMeasureTopology(measureTopology) {
  return Object.freeze({
    measureCount: measureTopology.measures.length,
    pickupMeasureCount: measureTopology.measures.filter((measure) => measure.isPickup).length,
    implicitMeasureCount: measureTopology.measures.filter((measure) => measure.implicit).length,
    meterChangeMeasureCount: measureTopology.measures.filter((measure) => measure.meterChangeAtStart).length,
    endQuarter: rationalToNumber(measureTopology.measures.at(-1).endQuarter),
  });
}
