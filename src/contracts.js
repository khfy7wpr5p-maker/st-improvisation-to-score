export class ImprovisationToScoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ImprovisationToScoreError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function assertFiniteNumber(value, field, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_NUMBER', `${field} must be a finite number.`, { field, value });
  }
  if ((exclusiveMin ? value <= min : value < min) || value > max) {
    fail('OUT_OF_RANGE', `${field} is outside the admitted range.`, { field, value, min, max });
  }
  return value;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x || 1;
}

export function rational(numerator, denominator = 1) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    fail('INVALID_RATIONAL', 'Rational numerator/denominator must be safe integers and denominator must be non-zero.', { numerator, denominator });
  }
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator);
  return Object.freeze({
    numerator: (numerator / divisor) * sign,
    denominator: Math.abs(denominator / divisor),
  });
}

export function rationalToNumber(value) {
  return value.numerator / value.denominator;
}

export function createRawPerformanceEvent(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_EVENT', 'RawPerformanceEvent must be a plain object.');
  }
  const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
  if (!eventId || eventId.length > 160) fail('INVALID_EVENT_ID', 'eventId must be a non-empty bounded string.');
  if (!Number.isInteger(input.midiPitch) || input.midiPitch < 0 || input.midiPitch > 127) {
    fail('INVALID_MIDI_PITCH', 'midiPitch must be an integer in 0..127.', { value: input.midiPitch });
  }
  const onsetSeconds = assertFiniteNumber(input.onsetSeconds, 'onsetSeconds', { min: 0 });
  const offsetSeconds = assertFiniteNumber(input.offsetSeconds, 'offsetSeconds', { min: onsetSeconds, exclusiveMin: true });
  const confidence = input.confidence == null ? null : assertFiniteNumber(input.confidence, 'confidence', { min: 0, max: 1 });
  const amplitude = input.amplitude == null ? null : assertFiniteNumber(input.amplitude, 'amplitude', { min: 0, max: 1 });
  const sourceEventId = input.sourceEventId == null ? null : String(input.sourceEventId).slice(0, 256);
  return Object.freeze({ eventId, midiPitch: input.midiPitch, onsetSeconds, offsetSeconds, confidence, amplitude, sourceEventId });
}

export function createTranscriptionContext({ bpm, meterNumerator, meterDenominator, smallestNoteDenominator = 16, allowTriplets = false }) {
  assertFiniteNumber(bpm, 'bpm', { min: 1, max: 1000 });
  if (!Number.isInteger(meterNumerator) || meterNumerator < 1 || meterNumerator > 64) {
    fail('INVALID_METER', 'meterNumerator must be an integer in 1..64.');
  }
  if (![1, 2, 4, 8, 16, 32, 64].includes(meterDenominator)) {
    fail('INVALID_METER', 'meterDenominator must be one of 1,2,4,8,16,32,64.');
  }
  if (![8, 16, 32].includes(smallestNoteDenominator)) {
    fail('INVALID_QUANTIZATION_GRID', 'smallestNoteDenominator must be 8, 16, or 32 in Stage 00.');
  }
  return Object.freeze({ bpm, meterNumerator, meterDenominator, smallestNoteDenominator, allowTriplets: allowTriplets === true });
}

export function measureLengthQuarter(context) {
  return rational(context.meterNumerator * 4, context.meterDenominator);
}
