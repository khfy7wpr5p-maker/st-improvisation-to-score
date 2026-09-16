import { createRawPerformanceEvent } from '../contracts.js';

export const GUITAR_REFINEMENT_VERSION = '0.1.0';

const DEFAULT_OPTIONS = Object.freeze({
  maxSingleLineGapSeconds: 0.75,
  maxContinuationPitchDistanceSemitones: 12,
  minimumOverlapRatio: 1.6,
});

function durationSeconds(event) {
  return event.offsetSeconds - event.onsetSeconds;
}

function normalizeEvents(events) {
  return [...events]
    .map((event) => createRawPerformanceEvent(event))
    .sort((a, b) => a.onsetSeconds - b.onsetSeconds || a.midiPitch - b.midiPitch || a.eventId.localeCompare(b.eventId));
}

function groupExactAttacks(events) {
  const groups = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.onsetSeconds - event.onsetSeconds) <= 1e-9) previous.events.push(event);
    else groups.push({ onsetSeconds: event.onsetSeconds, events: [event] });
  }
  return groups;
}

function nearestPitchDistance(pitch, events) {
  if (events.length === 0) return Infinity;
  return Math.min(...events.map((event) => Math.abs(event.midiPitch - pitch)));
}

function derivedEvent(event, offsetSeconds) {
  return createRawPerformanceEvent({
    eventId: event.eventId,
    midiPitch: event.midiPitch,
    onsetSeconds: event.onsetSeconds,
    offsetSeconds,
    confidence: event.confidence,
    amplitude: event.amplitude,
    sourceEventId: event.sourceEventId,
  });
}

export function refineGuitarDurationsForVoicePressure(eventsInput, optionsInput = {}) {
  const events = normalizeEvents(eventsInput);
  const options = Object.freeze({
    maxSingleLineGapSeconds: Number.isFinite(optionsInput.maxSingleLineGapSeconds)
      ? optionsInput.maxSingleLineGapSeconds
      : DEFAULT_OPTIONS.maxSingleLineGapSeconds,
    maxContinuationPitchDistanceSemitones: Number.isFinite(optionsInput.maxContinuationPitchDistanceSemitones)
      ? optionsInput.maxContinuationPitchDistanceSemitones
      : DEFAULT_OPTIONS.maxContinuationPitchDistanceSemitones,
    minimumOverlapRatio: Number.isFinite(optionsInput.minimumOverlapRatio)
      ? optionsInput.minimumOverlapRatio
      : DEFAULT_OPTIONS.minimumOverlapRatio,
  });

  const groups = groupExactAttacks(events);
  const eventToGroupIndex = new Map();
  groups.forEach((group, index) => group.events.forEach((event) => eventToGroupIndex.set(event.eventId, index)));

  const refinedEvents = [];
  const provenance = [];
  let cappedEventCount = 0;

  for (const event of events) {
    const groupIndex = eventToGroupIndex.get(event.eventId);
    const group = groups[groupIndex];
    const nextGroup = groups[groupIndex + 1] ?? null;
    let offsetSeconds = event.offsetSeconds;
    const reasons = [];

    if (group?.events.length === 1 && nextGroup) {
      const gapSeconds = nextGroup.onsetSeconds - event.onsetSeconds;
      const acousticDuration = durationSeconds(event);
      const overlapSeconds = event.offsetSeconds - nextGroup.onsetSeconds;
      const pitchDistance = nearestPitchDistance(event.midiPitch, nextGroup.events);
      const continuationLike = pitchDistance <= options.maxContinuationPitchDistanceSemitones;
      const materiallyOverlapping = overlapSeconds > 0 && acousticDuration >= gapSeconds * options.minimumOverlapRatio;

      if (
        gapSeconds > 0 &&
        gapSeconds <= options.maxSingleLineGapSeconds &&
        continuationLike &&
        materiallyOverlapping
      ) {
        offsetSeconds = nextGroup.onsetSeconds;
        reasons.push('SINGLE_LINE_RESONANCE_CAP');
        cappedEventCount += 1;
      }
    }

    refinedEvents.push(derivedEvent(event, offsetSeconds));
    provenance.push(Object.freeze({
      eventId: event.eventId,
      action: reasons.length > 0 ? 'DURATION_REFINED' : 'UNCHANGED',
      sourceOffsetSeconds: event.offsetSeconds,
      refinedOffsetSeconds: offsetSeconds,
      reasons: Object.freeze(reasons),
    }));
  }

  const diagnostics = cappedEventCount > 0
    ? Object.freeze([Object.freeze({
      code: 'GUITAR_SINGLE_LINE_RESONANCE_REFINED',
      message: 'Acoustic ringing that would create unnecessary extra notation voices was capped at a compatible following attack while preserving provenance.',
      details: Object.freeze({ cappedEventCount }),
    })])
    : Object.freeze([]);

  return Object.freeze({
    schemaVersion: 'guitar-refinement-v0.1',
    refinementVersion: GUITAR_REFINEMENT_VERSION,
    policy: 'MINIMUM_NECESSARY_DYNAMIC_VOICES_WITHOUT_FIXED_CAP',
    options,
    cappedEventCount,
    refinedEvents: Object.freeze(refinedEvents),
    provenance: Object.freeze(provenance),
    diagnostics,
  });
}
