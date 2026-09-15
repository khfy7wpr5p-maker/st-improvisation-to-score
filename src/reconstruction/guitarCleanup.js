import { ImprovisationToScoreError, createRawPerformanceEvent } from '../contracts.js';

export const GUITAR_CLEANUP_VERSION = '0.1.0';
export const GUITAR_CLEANUP_MAX_EVENTS = 100_000;

const DEFAULT_OPTIONS = Object.freeze({
  minimumDurationSeconds: 0.07,
  weakAmplitudeThreshold: 0.12,
  weakShortDurationSeconds: 0.14,
  onsetClusterToleranceSeconds: 0.04,
  materialOnsetSpreadWarningSeconds: 0.07,
  maxChordSustainGapSeconds: 2.0,
});

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function finite(value, field, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('INVALID_GUITAR_CLEANUP_OPTION', `${field} must be finite.`, { field, value });
  }
  if ((exclusiveMin ? value <= min : value < min) || value > max) {
    fail('INVALID_GUITAR_CLEANUP_OPTION', `${field} is outside the admitted range.`, { field, value, min, max });
  }
  return value;
}

function normalizeOptions(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_GUITAR_CLEANUP_OPTIONS', 'Guitar cleanup options must be a plain object.');
  }
  const pitchRange = input.pitchRange == null ? null : input.pitchRange;
  if (pitchRange !== null) {
    if (
      typeof pitchRange !== 'object' ||
      Array.isArray(pitchRange) ||
      !Number.isInteger(pitchRange.minMidi) ||
      !Number.isInteger(pitchRange.maxMidi) ||
      pitchRange.minMidi < 0 ||
      pitchRange.maxMidi > 127 ||
      pitchRange.minMidi > pitchRange.maxMidi
    ) {
      fail('INVALID_GUITAR_PITCH_RANGE', 'pitchRange must contain integer minMidi/maxMidi in 0..127.');
    }
  }

  return Object.freeze({
    minimumDurationSeconds: finite(
      input.minimumDurationSeconds ?? DEFAULT_OPTIONS.minimumDurationSeconds,
      'minimumDurationSeconds',
      { min: 0, max: 2, exclusiveMin: true },
    ),
    weakAmplitudeThreshold: finite(
      input.weakAmplitudeThreshold ?? DEFAULT_OPTIONS.weakAmplitudeThreshold,
      'weakAmplitudeThreshold',
      { min: 0, max: 1 },
    ),
    weakShortDurationSeconds: finite(
      input.weakShortDurationSeconds ?? DEFAULT_OPTIONS.weakShortDurationSeconds,
      'weakShortDurationSeconds',
      { min: 0, max: 4, exclusiveMin: true },
    ),
    onsetClusterToleranceSeconds: finite(
      input.onsetClusterToleranceSeconds ?? DEFAULT_OPTIONS.onsetClusterToleranceSeconds,
      'onsetClusterToleranceSeconds',
      { min: 0, max: 0.25 },
    ),
    materialOnsetSpreadWarningSeconds: finite(
      input.materialOnsetSpreadWarningSeconds ?? DEFAULT_OPTIONS.materialOnsetSpreadWarningSeconds,
      'materialOnsetSpreadWarningSeconds',
      { min: 0, max: 0.5 },
    ),
    maxChordSustainGapSeconds: finite(
      input.maxChordSustainGapSeconds ?? DEFAULT_OPTIONS.maxChordSustainGapSeconds,
      'maxChordSustainGapSeconds',
      { min: 0.1, max: 8 },
    ),
    pitchRange: pitchRange === null ? null : Object.freeze({
      minMidi: pitchRange.minMidi,
      maxMidi: pitchRange.maxMidi,
    }),
  });
}

function diagnostic(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function durationSeconds(event) {
  return event.offsetSeconds - event.onsetSeconds;
}

function normalizeEvents(rawEvents) {
  if (!Array.isArray(rawEvents)) fail('INVALID_EVENT_LIST', 'rawEvents must be an array.');
  if (rawEvents.length > GUITAR_CLEANUP_MAX_EVENTS) {
    fail('GUITAR_CLEANUP_EVENT_LIMIT_EXCEEDED', 'Raw event count exceeds the cleanup safety envelope.', {
      limit: GUITAR_CLEANUP_MAX_EVENTS,
      actual: rawEvents.length,
    });
  }

  const ids = new Set();
  return rawEvents.map((event) => {
    const normalized = createRawPerformanceEvent(event);
    if (ids.has(normalized.eventId)) fail('DUPLICATE_EVENT_ID', 'eventId values must be unique.', { eventId: normalized.eventId });
    ids.add(normalized.eventId);
    return normalized;
  }).sort((a, b) =>
    a.onsetSeconds - b.onsetSeconds ||
    a.midiPitch - b.midiPitch ||
    a.eventId.localeCompare(b.eventId)
  );
}

function clusterByOnset(events, toleranceSeconds) {
  const groups = [];
  for (const event of events) {
    const previous = groups.at(-1);
    if (previous && event.onsetSeconds - previous.anchorSeconds <= toleranceSeconds) {
      previous.events.push(event);
      previous.lastSeconds = Math.max(previous.lastSeconds, event.onsetSeconds);
      continue;
    }
    groups.push({
      anchorSeconds: event.onsetSeconds,
      lastSeconds: event.onsetSeconds,
      events: [event],
    });
  }
  return groups;
}

function preferredDuplicate(events) {
  return [...events].sort((a, b) => {
    const aAmp = a.amplitude ?? -1;
    const bAmp = b.amplitude ?? -1;
    if (aAmp !== bAmp) return bAmp - aAmp;
    const durationDelta = durationSeconds(b) - durationSeconds(a);
    if (Math.abs(durationDelta) > 1e-9) return durationDelta;
    return a.eventId.localeCompare(b.eventId);
  })[0];
}

function derivedEvent(event, onsetSeconds, offsetSeconds) {
  return createRawPerformanceEvent({
    eventId: event.eventId,
    midiPitch: event.midiPitch,
    onsetSeconds,
    offsetSeconds,
    confidence: event.confidence,
    amplitude: event.amplitude,
    sourceEventId: event.sourceEventId,
  });
}

export function cleanGuitarPerformanceEvents(rawEvents, optionsInput = {}) {
  const options = normalizeOptions(optionsInput);
  const events = normalizeEvents(rawEvents);
  const groups = clusterByOnset(events, options.onsetClusterToleranceSeconds);
  const retained = [];
  const provenance = [];
  let suppressedCount = 0;
  let duplicateCount = 0;
  let onsetAdjustedCount = 0;
  let outsideSelectedRangeCount = 0;
  const attackGroups = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const duplicateMap = new Map();
    for (const event of group.events) {
      const list = duplicateMap.get(event.midiPitch) ?? [];
      list.push(event);
      duplicateMap.set(event.midiPitch, list);
    }

    const duplicateWinners = new Set();
    for (const samePitch of duplicateMap.values()) {
      duplicateWinners.add(preferredDuplicate(samePitch).eventId);
    }

    const retainedInGroup = [];
    for (const event of group.events) {
      const reasons = [];
      const sourceDurationSeconds = durationSeconds(event);

      if (!duplicateWinners.has(event.eventId)) {
        duplicateCount += 1;
        suppressedCount += 1;
        reasons.push('NEAR_SIMULTANEOUS_DUPLICATE_PITCH');
      } else if (sourceDurationSeconds < options.minimumDurationSeconds) {
        suppressedCount += 1;
        reasons.push('VERY_SHORT_CANDIDATE');
      } else if (
        event.amplitude !== null &&
        event.amplitude < options.weakAmplitudeThreshold &&
        sourceDurationSeconds < options.weakShortDurationSeconds
      ) {
        suppressedCount += 1;
        reasons.push('LOW_AMPLITUDE_SHORT_CANDIDATE');
      } else if (
        options.pitchRange !== null &&
        (event.midiPitch < options.pitchRange.minMidi || event.midiPitch > options.pitchRange.maxMidi)
      ) {
        suppressedCount += 1;
        outsideSelectedRangeCount += 1;
        reasons.push('OUTSIDE_SELECTED_GUITAR_RANGE');
      }

      if (reasons.length > 0) {
        provenance.push(Object.freeze({
          eventId: event.eventId,
          sourceEventId: event.sourceEventId,
          action: 'SUPPRESSED_FROM_DERIVED_VIEW',
          reasons: Object.freeze(reasons),
          sourceOnsetSeconds: event.onsetSeconds,
          sourceOffsetSeconds: event.offsetSeconds,
          derivedOnsetSeconds: null,
          derivedOffsetSeconds: null,
        }));
        continue;
      }

      const derivedOnsetSeconds = group.anchorSeconds;
      const derivedOffsetSeconds = derivedOnsetSeconds + sourceDurationSeconds;
      if (Math.abs(derivedOnsetSeconds - event.onsetSeconds) > 1e-9) onsetAdjustedCount += 1;
      const cleaned = derivedEvent(event, derivedOnsetSeconds, derivedOffsetSeconds);
      retained.push(cleaned);
      retainedInGroup.push(cleaned);
      provenance.push(Object.freeze({
        eventId: event.eventId,
        sourceEventId: event.sourceEventId,
        action: 'RETAINED',
        reasons: Object.freeze(
          Math.abs(derivedOnsetSeconds - event.onsetSeconds) > 1e-9
            ? ['ONSET_CLUSTER_ANCHORED']
            : []
        ),
        sourceOnsetSeconds: event.onsetSeconds,
        sourceOffsetSeconds: event.offsetSeconds,
        derivedOnsetSeconds,
        derivedOffsetSeconds,
      }));
    }

    if (retainedInGroup.length > 0) {
      attackGroups.push(Object.freeze({
        attackGroupId: `GAG${attackGroups.length + 1}`,
        onsetSeconds: group.anchorSeconds,
        spreadSeconds: group.lastSeconds - group.anchorSeconds,
        eventIds: Object.freeze(retainedInGroup.map((event) => event.eventId)),
        midiPitches: Object.freeze(retainedInGroup.map((event) => event.midiPitch).sort((a, b) => a - b)),
      }));
    }
  }

  const diagnostics = [];
  if (suppressedCount > 0) {
    diagnostics.push(diagnostic(
      'GUITAR_CLEANUP_CANDIDATES_SUPPRESSED',
      'Low-value acoustic candidates were excluded from the derived musical event view while raw Basic Pitch evidence was preserved.',
      { suppressedCount, rawEventCount: events.length, retainedEventCount: retained.length },
    ));
  }
  if (duplicateCount > 0) {
    diagnostics.push(diagnostic(
      'GUITAR_CLEANUP_DUPLICATE_PITCHES_MERGED',
      'Near-simultaneous duplicate-pitch candidates were consolidated in the derived view.',
      { duplicateCount },
    ));
  }
  if (onsetAdjustedCount > 0) {
    diagnostics.push(diagnostic(
      'GUITAR_CLEANUP_ONSETS_CONSOLIDATED',
      'Near-simultaneous guitar attacks were assigned a shared musical attack anchor while raw onset times remain in provenance.',
      { adjustedEventCount: onsetAdjustedCount, attackGroupCount: attackGroups.length },
    ));
  }
  if (outsideSelectedRangeCount > 0) {
    diagnostics.push(diagnostic(
      'GUITAR_CLEANUP_SELECTED_RANGE_APPLIED',
      'The explicitly selected guitar pitch-range prior excluded out-of-range candidates from the derived view.',
      { outsideSelectedRangeCount, pitchRange: options.pitchRange },
    ));
  }

  const materialSpreadCount = attackGroups.filter(
    (group) => group.spreadSeconds > options.materialOnsetSpreadWarningSeconds
  ).length;
  if (materialSpreadCount > 0) {
    diagnostics.push(diagnostic(
      'GUITAR_ATTACK_SPREAD_REQUIRES_REVIEW',
      'Some clustered attacks have a materially large onset spread and should remain reviewable.',
      { materialSpreadCount },
    ));
  }

  return Object.freeze({
    schemaVersion: 'guitar-cleanup-v0.1',
    cleanupVersion: GUITAR_CLEANUP_VERSION,
    authority: 'DERIVED_REVERSIBLE_MUSICAL_VIEW',
    policy: 'RAW_PROVIDER_EVIDENCE_IMMUTABLE',
    options,
    rawEventCount: events.length,
    retainedEventCount: retained.length,
    suppressedEventCount: suppressedCount,
    rawEvents: Object.freeze(events),
    cleanedEvents: Object.freeze(retained),
    attackGroups: Object.freeze(attackGroups),
    provenance: Object.freeze(provenance),
    diagnostics: Object.freeze(diagnostics),
  });
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

function nearestGridDuration(seconds, regularStepSeconds, tripletStepSeconds, minimumStepSeconds) {
  const candidates = new Set([minimumStepSeconds]);
  const limit = Math.max(seconds + regularStepSeconds * 2, minimumStepSeconds * 2);
  for (const step of [regularStepSeconds, tripletStepSeconds]) {
    if (!Number.isFinite(step) || step <= 0) continue;
    for (let multiple = 1; multiple * step <= limit + 1e-9; multiple += 1) {
      candidates.add(Number((multiple * step).toFixed(9)));
    }
  }
  return [...candidates].sort((a, b) => {
    const delta = Math.abs(a - seconds) - Math.abs(b - seconds);
    if (Math.abs(delta) > 1e-12) return delta;
    return a - b;
  })[0];
}

function isRegisterSeparated(pitch, nextPitches) {
  if (nextPitches.length === 0) return false;
  const min = Math.min(...nextPitches);
  const max = Math.max(...nextPitches);
  return pitch <= min - 12 || pitch >= max + 12;
}

export function reconstructGuitarDurations(cleanedEvents, optionsInput = {}) {
  const events = normalizeEvents(cleanedEvents);
  const bpm = finite(Number(optionsInput.bpm), 'bpm', { min: 20, max: 400 });
  const smallestNoteDenominator = optionsInput.smallestNoteDenominator ?? 16;
  if (![8, 16, 32].includes(smallestNoteDenominator)) {
    fail('INVALID_GUITAR_CLEANUP_OPTION', 'smallestNoteDenominator must be 8, 16, or 32.');
  }
  const allowTriplets = optionsInput.allowTriplets !== false;
  const maxChordSustainGapSeconds = finite(
    optionsInput.maxChordSustainGapSeconds ?? DEFAULT_OPTIONS.maxChordSustainGapSeconds,
    'maxChordSustainGapSeconds',
    { min: 0.1, max: 8 },
  );

  const regularStepSeconds = 60 / bpm * (4 / smallestNoteDenominator);
  const tripletStepSeconds = allowTriplets ? 60 / bpm / 3 : Infinity;
  const minimumStepSeconds = Math.min(regularStepSeconds, tripletStepSeconds);
  const groups = groupExactAttacks(events);
  const eventToGroup = new Map();
  groups.forEach((group, index) => {
    for (const event of group.events) eventToGroup.set(event.eventId, index);
  });

  const reconstructedEvents = [];
  const provenance = [];
  let changedCount = 0;
  const reasonCounts = new Map();
  const nextSamePitchByEventId = new Map();
  const nextSeenByPitch = new Map();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const next = nextSeenByPitch.get(event.midiPitch) ?? null;
    nextSamePitchByEventId.set(event.eventId, next);
    nextSeenByPitch.set(event.midiPitch, event);
  }

  for (const event of events) {
    const reasons = [];
    const sourceDurationSeconds = durationSeconds(event);
    let evidenceEndSeconds = event.offsetSeconds;

    const nextSamePitch = nextSamePitchByEventId.get(event.eventId) ?? null;
    if (nextSamePitch && nextSamePitch.onsetSeconds < evidenceEndSeconds) {
      evidenceEndSeconds = nextSamePitch.onsetSeconds;
      reasons.push('REARTICULATION_CAP');
    }

    const groupIndex = eventToGroup.get(event.eventId);
    const currentGroup = groups[groupIndex];
    const nextGroup = groups[groupIndex + 1] ?? null;
    if (
      currentGroup?.events.length > 1 &&
      nextGroup &&
      nextGroup.onsetSeconds > event.onsetSeconds &&
      nextGroup.onsetSeconds - event.onsetSeconds <= maxChordSustainGapSeconds &&
      nextGroup.onsetSeconds < evidenceEndSeconds &&
      !isRegisterSeparated(event.midiPitch, nextGroup.events.map((item) => item.midiPitch))
    ) {
      evidenceEndSeconds = nextGroup.onsetSeconds;
      reasons.push('CHORD_RESONANCE_CAP');
    }

    const evidenceDurationSeconds = Math.max(minimumStepSeconds, evidenceEndSeconds - event.onsetSeconds);
    const snappedDurationSeconds = nearestGridDuration(
      evidenceDurationSeconds,
      regularStepSeconds,
      tripletStepSeconds,
      minimumStepSeconds,
    );
    const maxSnapError = Math.max(0.06, minimumStepSeconds * 0.45);
    const useSnapped = reasons.length > 0 || Math.abs(snappedDurationSeconds - evidenceDurationSeconds) <= maxSnapError;
    const reconstructedDurationSeconds = useSnapped ? snappedDurationSeconds : evidenceDurationSeconds;
    if (useSnapped && Math.abs(snappedDurationSeconds - evidenceDurationSeconds) > 1e-9) {
      reasons.push('GRID_DURATION_RECONSTRUCTION');
    }

    const reconstructed = derivedEvent(
      event,
      event.onsetSeconds,
      event.onsetSeconds + reconstructedDurationSeconds,
    );
    reconstructedEvents.push(reconstructed);

    const changed = Math.abs(reconstructed.offsetSeconds - event.offsetSeconds) > 1e-6;
    if (changed) changedCount += 1;
    for (const reason of reasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);

    provenance.push(Object.freeze({
      eventId: event.eventId,
      sourceEventId: event.sourceEventId,
      sourceOnsetSeconds: event.onsetSeconds,
      sourceOffsetSeconds: event.offsetSeconds,
      sourceDurationSeconds,
      reconstructedOnsetSeconds: reconstructed.onsetSeconds,
      reconstructedOffsetSeconds: reconstructed.offsetSeconds,
      reconstructedDurationSeconds,
      changed,
      reasons: Object.freeze(reasons),
    }));
  }

  const diagnostics = [];
  if (changedCount > 0) {
    diagnostics.push(diagnostic(
      'GUITAR_DURATION_RECONSTRUCTION_APPLIED',
      'Written-duration evidence was reconstructed from re-articulation, chord changes, and the selected rhythmic grid instead of treating acoustic sustain as canonical notation.',
      {
        changedCount,
        eventCount: events.length,
        reasonCounts: Object.freeze(Object.fromEntries(reasonCounts)),
      },
    ));
  }

  return Object.freeze({
    schemaVersion: 'guitar-duration-reconstruction-v0.1',
    cleanupVersion: GUITAR_CLEANUP_VERSION,
    authority: 'DERIVED_REVERSIBLE_MUSICAL_VIEW',
    bpm,
    smallestNoteDenominator,
    allowTriplets,
    grid: Object.freeze({
      regularStepSeconds,
      tripletStepSeconds: Number.isFinite(tripletStepSeconds) ? tripletStepSeconds : null,
      minimumStepSeconds,
    }),
    sourceEvents: Object.freeze(events),
    reconstructedEvents: Object.freeze(reconstructedEvents),
    provenance: Object.freeze(provenance),
    diagnostics: Object.freeze(diagnostics),
  });
}
