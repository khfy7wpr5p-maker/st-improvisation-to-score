import {
  ImprovisationToScoreError,
  createTranscriptionContext,
  rational,
  rationalToNumber,
} from '../contracts.js';

export const TIMING_MAP_VERSION = '0.2.0';
export const TIMING_MAP_AUTHORITY = 'PROVISIONAL_TIMING_MAP';
export const TIMING_MAP_MAX_CHANGES = 10_000;

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function compare(left, right) {
  return left.numerator * right.denominator - right.numerator * left.denominator;
}

function normalizePosition(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_TIMING_MAP_POSITION', `${field} must be a rational object.`);
  const position = rational(value.numerator, value.denominator);
  if (position.numerator < 0) fail('INVALID_TIMING_MAP_POSITION', `${field} must be non-negative.`);
  return position;
}

function boundedAuthority(value, fallback, field) {
  const resolved = value ?? fallback;
  if (typeof resolved !== 'string' || resolved.length === 0 || resolved.length > 96) {
    fail('INVALID_TIMING_MAP_AUTHORITY', `${field} must be a non-empty bounded string.`);
  }
  return resolved;
}

function finiteBpm(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 1000) {
    fail('INVALID_TIMING_MAP_TEMPO', `${field} must be finite in 1..1000.`, { value });
  }
  return value;
}

function normalizeTempoChanges(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > TIMING_MAP_MAX_CHANGES) {
    fail('INVALID_TIMING_MAP', 'tempoChanges must contain 1..10000 entries.');
  }
  const changes = input.map((change, index) => {
    if (change === null || typeof change !== 'object' || Array.isArray(change)) fail('INVALID_TIMING_MAP', 'Tempo change must be an object.', { index });
    return Object.freeze({
      positionQuarter: normalizePosition(change.positionQuarter, `tempoChanges[${index}].positionQuarter`),
      bpm: finiteBpm(change.bpm, `tempoChanges[${index}].bpm`),
      sourceAuthority: boundedAuthority(change.sourceAuthority, 'UNSPECIFIED_TIMING_EVIDENCE', `tempoChanges[${index}].sourceAuthority`),
    });
  });
  validateOrderedOrigin(changes, 'tempoChanges');
  return Object.freeze(changes);
}

function normalizeMeterChanges(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > TIMING_MAP_MAX_CHANGES) {
    fail('INVALID_TIMING_MAP', 'meterChanges must contain 1..10000 entries.');
  }
  const changes = input.map((change, index) => {
    if (change === null || typeof change !== 'object' || Array.isArray(change)) fail('INVALID_TIMING_MAP', 'Meter change must be an object.', { index });
    if (!Number.isInteger(change.numerator) || change.numerator < 1 || change.numerator > 64) {
      fail('INVALID_TIMING_MAP_METER', 'Meter numerator must be an integer in 1..64.', { index, value: change.numerator });
    }
    if (![1, 2, 4, 8, 16, 32, 64].includes(change.denominator)) {
      fail('INVALID_TIMING_MAP_METER', 'Meter denominator is unsupported.', { index, value: change.denominator });
    }
    return Object.freeze({
      positionQuarter: normalizePosition(change.positionQuarter, `meterChanges[${index}].positionQuarter`),
      numerator: change.numerator,
      denominator: change.denominator,
      sourceAuthority: boundedAuthority(change.sourceAuthority, 'UNSPECIFIED_METER_EVIDENCE', `meterChanges[${index}].sourceAuthority`),
    });
  });
  validateOrderedOrigin(changes, 'meterChanges');
  return Object.freeze(changes);
}

function validateOrderedOrigin(changes, field) {
  const zero = rational(0, 1);
  if (compare(changes[0].positionQuarter, zero) !== 0) {
    fail('TIMING_MAP_ORIGIN_REQUIRED', `${field} must begin at musical position zero.`);
  }
  for (let index = 1; index < changes.length; index += 1) {
    if (compare(changes[index].positionQuarter, changes[index - 1].positionQuarter) <= 0) {
      fail('TIMING_MAP_CHANGES_NOT_STRICTLY_ORDERED', `${field} positions must be strictly increasing.`, { index });
    }
  }
}

function normalizeMap(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TIMING_MAP', 'Timing map must be an object.');
  return createTimingMap(input);
}

function effectiveChange(changes, positionQuarter) {
  let current = changes[0];
  for (let index = 1; index < changes.length; index += 1) {
    if (compare(changes[index].positionQuarter, positionQuarter) > 0) break;
    current = changes[index];
  }
  return current;
}

function tempoBoundarySeconds(tempoChanges) {
  const boundaries = [0];
  let elapsed = 0;
  for (let index = 1; index < tempoChanges.length; index += 1) {
    const previous = tempoChanges[index - 1];
    const current = tempoChanges[index];
    const quarterDistance = rationalToNumber(current.positionQuarter) - rationalToNumber(previous.positionQuarter);
    elapsed += quarterDistance * 60 / previous.bpm;
    if (!Number.isFinite(elapsed) || elapsed < 0) fail('TIMING_MAP_ELAPSED_OVERFLOW', 'Tempo map elapsed-time accumulation is not finite.', { index });
    boundaries.push(elapsed);
  }
  return boundaries;
}

export function createTimingMap(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_TIMING_MAP', 'Timing map input must be a plain object.');
  const tempoChanges = normalizeTempoChanges(input.tempoChanges);
  const meterChanges = normalizeMeterChanges(input.meterChanges);
  const source = input.source ?? 'TRANSCRIPTION_PIPELINE';
  if (typeof source !== 'string' || source.length === 0 || source.length > 128) fail('INVALID_TIMING_MAP_SOURCE', 'Timing map source must be a non-empty bounded string.');
  return Object.freeze({
    schemaVersion: 'timing-map-v0.1',
    mapVersion: TIMING_MAP_VERSION,
    authority: TIMING_MAP_AUTHORITY,
    source,
    tempoChanges,
    meterChanges,
  });
}

export function createConstantTimingMapFromContext(contextInput, metadata = {}) {
  const context = createTranscriptionContext(contextInput);
  return createTimingMap({
    source: metadata.source ?? 'TRANSCRIPTION_CONTEXT',
    tempoChanges: [{
      positionQuarter: rational(0, 1),
      bpm: context.bpm,
      sourceAuthority: metadata.tempoSourceAuthority ?? 'TRANSCRIPTION_CONTEXT',
    }],
    meterChanges: [{
      positionQuarter: rational(0, 1),
      numerator: context.meterNumerator,
      denominator: context.meterDenominator,
      sourceAuthority: metadata.meterSourceAuthority ?? 'TRANSCRIPTION_CONTEXT',
    }],
  });
}

export function effectiveTempoAtQuarter(timingMapInput, positionInput) {
  const timingMap = normalizeMap(timingMapInput);
  const positionQuarter = normalizePosition(positionInput, 'positionQuarter');
  return effectiveChange(timingMap.tempoChanges, positionQuarter);
}

export function effectiveMeterAtQuarter(timingMapInput, positionInput) {
  const timingMap = normalizeMap(timingMapInput);
  const positionQuarter = normalizePosition(positionInput, 'positionQuarter');
  return effectiveChange(timingMap.meterChanges, positionQuarter);
}

export function quarterPositionToElapsedSeconds(timingMapInput, positionInput) {
  const timingMap = normalizeMap(timingMapInput);
  const positionQuarter = normalizePosition(positionInput, 'positionQuarter');
  const targetQuarter = rationalToNumber(positionQuarter);
  const boundaries = tempoBoundarySeconds(timingMap.tempoChanges);
  let segmentIndex = 0;
  for (let index = 1; index < timingMap.tempoChanges.length; index += 1) {
    if (compare(timingMap.tempoChanges[index].positionQuarter, positionQuarter) > 0) break;
    segmentIndex = index;
  }
  const segment = timingMap.tempoChanges[segmentIndex];
  const localQuarter = targetQuarter - rationalToNumber(segment.positionQuarter);
  const elapsed = boundaries[segmentIndex] + localQuarter * 60 / segment.bpm;
  if (!Number.isFinite(elapsed) || elapsed < 0) fail('TIMING_MAP_ELAPSED_OVERFLOW', 'Mapped elapsed seconds are not finite.');
  return elapsed;
}

export function elapsedSecondsToQuarterPosition(timingMapInput, seconds) {
  const timingMap = normalizeMap(timingMapInput);
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    fail('INVALID_SECONDS', 'seconds must be finite and >= 0.', { seconds });
  }
  const boundaries = tempoBoundarySeconds(timingMap.tempoChanges);
  let segmentIndex = timingMap.tempoChanges.length - 1;
  for (let index = 0; index < timingMap.tempoChanges.length - 1; index += 1) {
    if (seconds < boundaries[index + 1]) {
      segmentIndex = index;
      break;
    }
  }
  const segment = timingMap.tempoChanges[segmentIndex];
  const localSeconds = seconds - boundaries[segmentIndex];
  const quarter = rationalToNumber(segment.positionQuarter) + localSeconds * segment.bpm / 60;
  if (!Number.isFinite(quarter) || quarter < 0) fail('TIMING_MAP_POSITION_OVERFLOW', 'Mapped musical position is not finite.');
  return quarter;
}
