import { ImprovisationToScoreError, createRawPerformanceEvent } from '../contracts.js';

export const GUITAR_NOTATION_SIMPLIFICATION_VERSION = '0.2.0';

const DEFAULT_OPTIONS = Object.freeze({
  maxChordDurationSpreadQuarter: 0.5,
  maxNextAttackSnapQuarter: 0.5,
  maxMelodicPitchDistanceSemitones: 7,
  maxMelodicOverlapQuarter: 0.25,
  maxMelodicGapQuarter: 0.125,
});

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function finite(value, field, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_NOTATION_SIMPLIFICATION_OPTION', `${field} must be finite.`, { field, value });
  }
  if ((exclusiveMin ? value <= min : value < min) || value > max) {
    fail('INVALID_NOTATION_SIMPLIFICATION_OPTION', `${field} is outside the admitted range.`, {
      field,
      value,
      min,
      max,
    });
  }
  return value;
}

function normalizeOptions(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_NOTATION_SIMPLIFICATION_OPTIONS', 'Notation simplification options must be a plain object.');
  }
  return Object.freeze({
    maxChordDurationSpreadQuarter: finite(
      input.maxChordDurationSpreadQuarter ?? DEFAULT_OPTIONS.maxChordDurationSpreadQuarter,
      'maxChordDurationSpreadQuarter',
      { min: 0, max: 2 },
    ),
    maxNextAttackSnapQuarter: finite(
      input.maxNextAttackSnapQuarter ?? DEFAULT_OPTIONS.maxNextAttackSnapQuarter,
      'maxNextAttackSnapQuarter',
      { min: 0, max: 2 },
    ),
    maxMelodicPitchDistanceSemitones: finite(
      input.maxMelodicPitchDistanceSemitones ?? DEFAULT_OPTIONS.maxMelodicPitchDistanceSemitones,
      'maxMelodicPitchDistanceSemitones',
      { min: 0, max: 24 },
    ),
    maxMelodicOverlapQuarter: finite(
      input.maxMelodicOverlapQuarter ?? DEFAULT_OPTIONS.maxMelodicOverlapQuarter,
      'maxMelodicOverlapQuarter',
      { min: 0, max: 1 },
    ),
    maxMelodicGapQuarter: finite(
      input.maxMelodicGapQuarter ?? DEFAULT_OPTIONS.maxMelodicGapQuarter,
      'maxMelodicGapQuarter',
      { min: 0, max: 1 },
    ),
  });
}

function normalizeEvents(eventsInput) {
  if (!Array.isArray(eventsInput)) fail('INVALID_EVENT_LIST', 'events must be an array.');
  return [...eventsInput]
    .map((event) => createRawPerformanceEvent(event))
    .sort((a, b) => a.onsetSeconds - b.onsetSeconds || a.midiPitch - b.midiPitch || a.eventId.localeCompare(b.eventId));
}

function durationSeconds(event) {
  return event.offsetSeconds - event.onsetSeconds;
}

function groupExactAttacks(events) {
  const groups = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.onsetSeconds - event.onsetSeconds) <= 1e-9) {
      previous.events.push(event);
      continue;
    }
    groups.push({ onsetSeconds: event.onsetSeconds, events: [event] });
  }
  return groups;
}

function representativeExistingDuration(durations) {
  const ordered = [...durations].sort((a, b) => a - b);
  return ordered[Math.floor((ordered.length - 1) / 2)];
}

function nearestPitchDistance(pitch, events) {
  if (events.length === 0) return Infinity;
  return Math.min(...events.map((event) => Math.abs(event.midiPitch - pitch)));
}

function derivedEvent(event, targetDurationSeconds) {
  return createRawPerformanceEvent({
    eventId: event.eventId,
    midiPitch: event.midiPitch,
    onsetSeconds: event.onsetSeconds,
    offsetSeconds: event.onsetSeconds + targetDurationSeconds,
    confidence: event.confidence,
    amplitude: event.amplitude,
    sourceEventId: event.sourceEventId,
  });
}

export function simplifyGuitarNotationDurations(eventsInput, optionsInput = {}) {
  const events = normalizeEvents(eventsInput);
  const options = normalizeOptions(optionsInput);
  const bpm = finite(Number(optionsInput.bpm), 'bpm', { min: 20, max: 400 });
  const quarterSeconds = 60 / bpm;
  const spreadToleranceSeconds = quarterSeconds * options.maxChordDurationSpreadQuarter;
  const nextAttackToleranceSeconds = quarterSeconds * options.maxNextAttackSnapQuarter;
  const melodicOverlapToleranceSeconds = quarterSeconds * options.maxMelodicOverlapQuarter;
  const melodicGapToleranceSeconds = quarterSeconds * options.maxMelodicGapQuarter;
  const groups = groupExactAttacks(events);
  const replacements = new Map();
  const provenance = [];
  let simplifiedGroupCount = 0;
  let adjustedEventCount = 0;
  let nextAttackAlignedGroupCount = 0;
  let clusteredDurationGroupCount = 0;
  let melodicContinuityAdjustmentCount = 0;
  let melodicOverlapCappedCount = 0;
  let melodicGapFilledCount = 0;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (group.events.length < 2) continue;

    const durations = group.events.map(durationSeconds);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const nextGroup = groups[groupIndex + 1] ?? null;
    const nextAttackGapSeconds = nextGroup ? nextGroup.onsetSeconds - group.onsetSeconds : null;
    let targetDurationSeconds = null;
    let reason = null;

    if (
      nextAttackGapSeconds !== null &&
      nextAttackGapSeconds > 0 &&
      group.events.every((event) => Math.abs(durationSeconds(event) - nextAttackGapSeconds) <= nextAttackToleranceSeconds)
    ) {
      targetDurationSeconds = nextAttackGapSeconds;
      reason = 'COMMON_DURATION_TO_NEXT_ATTACK';
      nextAttackAlignedGroupCount += 1;
    } else if (maxDuration - minDuration <= spreadToleranceSeconds) {
      targetDurationSeconds = representativeExistingDuration(durations);
      reason = 'CLUSTERED_CHORD_DURATION_NORMALIZATION';
      clusteredDurationGroupCount += 1;
    }

    if (targetDurationSeconds === null || targetDurationSeconds <= 0) continue;

    let changedInGroup = 0;
    for (const event of group.events) {
      const sourceDurationSeconds = durationSeconds(event);
      if (Math.abs(sourceDurationSeconds - targetDurationSeconds) <= 1e-9) continue;
      replacements.set(event.eventId, derivedEvent(event, targetDurationSeconds));
      provenance.push(Object.freeze({
        eventId: event.eventId,
        action: 'WRITTEN_DURATION_SIMPLIFIED',
        reason,
        sourceDurationSeconds,
        simplifiedDurationSeconds: targetDurationSeconds,
      }));
      changedInGroup += 1;
      adjustedEventCount += 1;
    }
    if (changedInGroup > 0) simplifiedGroupCount += 1;
  }

  for (let groupIndex = 0; groupIndex < groups.length - 1; groupIndex += 1) {
    const group = groups[groupIndex];
    const nextGroup = groups[groupIndex + 1];
    if (group.events.length !== 1 || !nextGroup || nextGroup.onsetSeconds <= group.onsetSeconds) continue;

    const sourceEvent = group.events[0];
    const event = replacements.get(sourceEvent.eventId) ?? sourceEvent;
    const pitchDistance = nearestPitchDistance(event.midiPitch, nextGroup.events);
    if (pitchDistance > options.maxMelodicPitchDistanceSemitones) continue;

    const boundarySeconds = nextGroup.onsetSeconds;
    const signedEndDeltaSeconds = event.offsetSeconds - boundarySeconds;
    let reason = null;

    if (
      signedEndDeltaSeconds > 1e-9 &&
      signedEndDeltaSeconds <= melodicOverlapToleranceSeconds
    ) {
      reason = 'SMALL_MELODIC_OVERLAP_CAPPED_TO_NEXT_ATTACK';
      melodicOverlapCappedCount += 1;
    } else if (
      signedEndDeltaSeconds < -1e-9 &&
      Math.abs(signedEndDeltaSeconds) <= melodicGapToleranceSeconds
    ) {
      reason = 'TINY_MELODIC_GAP_FILLED_TO_NEXT_ATTACK';
      melodicGapFilledCount += 1;
    }

    if (reason === null) continue;

    const targetDurationSeconds = boundarySeconds - event.onsetSeconds;
    if (targetDurationSeconds <= 0) continue;

    replacements.set(event.eventId, derivedEvent(event, targetDurationSeconds));
    provenance.push(Object.freeze({
      eventId: event.eventId,
      action: 'MELODIC_CONTINUITY_RECONSTRUCTED',
      reason,
      sourceDurationSeconds: durationSeconds(event),
      simplifiedDurationSeconds: targetDurationSeconds,
      nextAttackSeconds: boundarySeconds,
      pitchDistanceSemitones: pitchDistance,
    }));
    adjustedEventCount += 1;
    melodicContinuityAdjustmentCount += 1;
  }

  const simplifiedEvents = Object.freeze(events.map((event) => replacements.get(event.eventId) ?? event));
  const diagnostics = [];
  if (simplifiedGroupCount > 0) {
    diagnostics.push(Object.freeze({
      code: 'GUITAR_NOTATION_CHORD_DURATIONS_SIMPLIFIED',
      message: 'Near-equal same-attack guitar durations were normalized in the reversible notation view to reduce unnecessary voice and rest fragmentation.',
      details: Object.freeze({
        simplifiedGroupCount,
        adjustedEventCount,
        nextAttackAlignedGroupCount,
        clusteredDurationGroupCount,
      }),
    }));
  }
  if (melodicContinuityAdjustmentCount > 0) {
    diagnostics.push(Object.freeze({
      code: 'GUITAR_MELODIC_CONTINUITY_RECONSTRUCTED',
      message: 'Small same-register overlaps and micro-gaps were aligned to the next attack in the reversible notation view to preserve melodic voice continuity without imposing a fixed voice cap.',
      details: Object.freeze({
        melodicContinuityAdjustmentCount,
        melodicOverlapCappedCount,
        melodicGapFilledCount,
      }),
    }));
  }

  return Object.freeze({
    schemaVersion: 'guitar-notation-simplification-v0.2',
    simplificationVersion: GUITAR_NOTATION_SIMPLIFICATION_VERSION,
    authority: 'DERIVED_REVERSIBLE_NOTATION_VIEW',
    policy: 'RAW_AND_RECONSTRUCTED_EVIDENCE_PRESERVED',
    options: Object.freeze({ ...options, bpm }),
    simplifiedGroupCount,
    adjustedEventCount,
    melodicContinuityAdjustmentCount,
    melodicOverlapCappedCount,
    melodicGapFilledCount,
    simplifiedEvents,
    provenance: Object.freeze(provenance),
    diagnostics: Object.freeze(diagnostics),
  });
}
