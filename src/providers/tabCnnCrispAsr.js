export const TABCNN_CRISPASR_BRIDGE_VERSION = '0.1.0';
export const TABCNN_STANDARD_OPEN_MIDI_LOW_TO_HIGH = Object.freeze([40, 45, 50, 55, 59, 64]);

function finiteNumber(value, field, { min = -Infinity, exclusiveMin = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || (exclusiveMin ? n <= min : n < min)) {
    throw new TypeError(`${field} must be a finite number${Number.isFinite(min) ? ` ${exclusiveMin ? '>' : '>='} ${min}` : ''}.`);
  }
  return n;
}

function integer(value, field, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new TypeError(`${field} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

function freezeFret(entry, frameIndex, stringIndex, nClasses, silentClass) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`frames[${frameIndex}].frets[${stringIndex}] must be an object.`);
  }
  const fret = integer(entry.fret, `frames[${frameIndex}].frets[${stringIndex}].fret`, {
    min: -1,
    max: nClasses - 1,
  });
  if (fret === silentClass) {
    throw new TypeError(`frames[${frameIndex}].frets[${stringIndex}].fret must use -1 for the silent class.`);
  }
  const logp = entry.logp == null
    ? null
    : finiteNumber(entry.logp, `frames[${frameIndex}].frets[${stringIndex}].logp`);
  return Object.freeze({ fret, logp });
}

export function parseCrispAsrTabJson(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('CrispASR TabCNN payload must be a plain object.');
  }

  const framePeriodSeconds = finiteNumber(payload.frame_period_sec, 'frame_period_sec', {
    min: 0,
    exclusiveMin: true,
  });
  const nStrings = integer(payload.n_strings, 'n_strings', { min: 1, max: 64 });
  if (nStrings !== 6) {
    throw new TypeError('n_strings must be 6 for the supported TabCNN guitar bridge.');
  }
  const nClasses = integer(payload.n_classes, 'n_classes', { min: 2, max: 256 });
  const silentClass = integer(payload.silent_class, 'silent_class', { min: 0, max: nClasses - 1 });
  if (!Array.isArray(payload.frames)) {
    throw new TypeError('frames must be an array.');
  }

  const frames = payload.frames.map((frame, frameIndex) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
      throw new TypeError(`frames[${frameIndex}] must be an object.`);
    }
    const time = finiteNumber(frame.time, `frames[${frameIndex}].time`, { min: 0 });
    if (!Array.isArray(frame.frets) || frame.frets.length !== nStrings) {
      throw new TypeError(`frames[${frameIndex}].frets must contain exactly ${nStrings} string entries.`);
    }
    return Object.freeze({
      time,
      frets: Object.freeze(
        frame.frets.map((entry, stringIndex) =>
          freezeFret(entry, frameIndex, stringIndex, nClasses, silentClass)),
      ),
    });
  });

  return Object.freeze({
    schemaVersion: 'crispasr-tabcnn-shadow-v0.1',
    bridgeVersion: TABCNN_CRISPASR_BRIDGE_VERSION,
    authority: 'SHADOW_EVIDENCE_ONLY',
    file: typeof payload.file === 'string' ? payload.file : null,
    framePeriodSeconds,
    nStrings,
    nClasses,
    silentClass,
    frames: Object.freeze(frames),
  });
}

function confidenceFromLogProbability(logp) {
  if (!Number.isFinite(logp)) return null;
  const p = Math.exp(logp);
  if (!Number.isFinite(p)) return null;
  return Math.max(0, Math.min(1, p));
}

export function projectTabCnnFramesToPredictions(parsedInput) {
  const parsed = parsedInput?.schemaVersion === 'crispasr-tabcnn-shadow-v0.1'
    ? parsedInput
    : parseCrispAsrTabJson(parsedInput);

  const predictions = [];
  parsed.frames.forEach((frame, frameIndex) => {
    frame.frets.forEach((entry, stringIndex) => {
      if (entry.fret < 0) return;
      const onsetSeconds = frame.time;
      const offsetSeconds = onsetSeconds + parsed.framePeriodSeconds;
      predictions.push(Object.freeze({
        onsetSeconds,
        offsetSeconds,
        midiPitch: TABCNN_STANDARD_OPEN_MIDI_LOW_TO_HIGH[stringIndex] + entry.fret,
        stringIndex,
        fret: entry.fret,
        confidence: confidenceFromLogProbability(entry.logp),
        metadata: Object.freeze({
          sourceShape: 'CRISPASR_TABCNN_FRAME_EMISSION',
          frameIndex,
          framePeriodSeconds: parsed.framePeriodSeconds,
          rawFrame: frame,
        }),
      }));
    });
  });
  return Object.freeze(predictions);
}
