import { ImprovisationToScoreError, rational, rationalToNumber } from '../contracts.js';

export const VOICE_CANDIDATE_ANALYZER_VERSION = '0.1.0';
export const VOICE_CANDIDATE_MAX_EVENTS = 100_000;

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

function maxRational(values) {
  return values.reduce((best, value) => compare(value, best) > 0 ? value : best);
}

function rationalKey(value) {
  return `${value.numerator}/${value.denominator}`;
}

function validateEvent(event, index) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    fail('INVALID_QUANTIZED_EVENT', 'Quantized event must be an object.', { index });
  }
  if (typeof event.eventId !== 'string' || !event.eventId || event.eventId.length > 160) {
    fail('INVALID_QUANTIZED_EVENT', 'eventId must be a non-empty bounded string.', { index });
  }
  if (!Number.isInteger(event.midiPitch) || event.midiPitch < 0 || event.midiPitch > 127) {
    fail('INVALID_QUANTIZED_EVENT', 'midiPitch must be an integer in 0..127.', { index });
  }
  for (const [field, value] of [['onsetQuarter', event.onsetQuarter], ['durationQuarter', event.durationQuarter]]) {
    if (
      value === null ||
      typeof value !== 'object' ||
      !Number.isSafeInteger(value.numerator) ||
      !Number.isSafeInteger(value.denominator) ||
      value.denominator <= 0
    ) {
      fail('INVALID_QUANTIZED_EVENT', `${field} must be a normalized rational.`, { index, field });
    }
  }
  if (event.onsetQuarter.numerator < 0 || event.durationQuarter.numerator <= 0) {
    fail('INVALID_QUANTIZED_EVENT', 'onset must be non-negative and duration must be positive.', { index });
  }
}

function createAttackGroups(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = rationalKey(event.onsetQuarter);
    const existing = grouped.get(key);
    if (existing) existing.events.push(event);
    else grouped.set(key, { onsetQuarter: event.onsetQuarter, events: [event] });
  }

  return [...grouped.values()]
    .sort((a, b) => compare(a.onsetQuarter, b.onsetQuarter))
    .map((group, index) => {
      const orderedEvents = [...group.events].sort((a, b) => a.midiPitch - b.midiPitch || a.eventId.localeCompare(b.eventId));
      const endQuarter = maxRational(orderedEvents.map((event) => add(event.onsetQuarter, event.durationQuarter)));
      const centerPitch = orderedEvents.reduce((sum, event) => sum + event.midiPitch, 0) / orderedEvents.length;
      const durationKinds = new Set(orderedEvents.map((event) => rationalKey(event.durationQuarter)));
      return Object.freeze({
        attackGroupId: `AG${index + 1}`,
        onsetQuarter: group.onsetQuarter,
        endQuarter,
        eventIds: Object.freeze(orderedEvents.map((event) => event.eventId)),
        midiPitches: Object.freeze(orderedEvents.map((event) => event.midiPitch)),
        centerPitch,
        chordLike: orderedEvents.length > 1,
        mixedDurations: durationKinds.size > 1,
      });
    });
}

function candidateScore(voice, group, { pitchWeight, gapWeight }) {
  const pitchDistance = Math.abs(group.centerPitch - voice.centerPitch);
  const gapQuarter = rationalToNumber(subtract(group.onsetQuarter, voice.endQuarter));
  const score = pitchDistance * pitchWeight + Math.max(0, gapQuarter) * gapWeight;
  return Object.freeze({
    voiceId: voice.voiceId,
    score,
    pitchDistance,
    gapQuarter,
    previousAttackGroupId: voice.lastAttackGroupId,
  });
}

export function analyzeVoiceCandidates(quantizedEvents, options = {}) {
  if (!Array.isArray(quantizedEvents)) fail('INVALID_QUANTIZED_EVENT_LIST', 'quantizedEvents must be an array.');
  if (quantizedEvents.length > VOICE_CANDIDATE_MAX_EVENTS) {
    fail('VOICE_CANDIDATE_EVENT_LIMIT_EXCEEDED', 'Event count exceeds the resource-safety envelope.', {
      limit: VOICE_CANDIDATE_MAX_EVENTS,
      actual: quantizedEvents.length,
    });
  }

  const pitchWeight = Number.isFinite(options.pitchWeight) && options.pitchWeight >= 0 ? options.pitchWeight : 1;
  const gapWeight = Number.isFinite(options.gapWeight) && options.gapWeight >= 0 ? options.gapWeight : 0.5;
  const ambiguityMargin = Number.isFinite(options.ambiguityMargin) && options.ambiguityMargin >= 0 ? options.ambiguityMargin : 2;

  const ids = new Set();
  for (let index = 0; index < quantizedEvents.length; index += 1) {
    const event = quantizedEvents[index];
    validateEvent(event, index);
    if (ids.has(event.eventId)) fail('DUPLICATE_EVENT_ID', 'eventId values must be unique.', { eventId: event.eventId });
    ids.add(event.eventId);
  }

  const attackGroups = createAttackGroups(quantizedEvents);
  const voices = [];
  const assignments = [];
  let ambiguousAssignmentCount = 0;

  for (const group of attackGroups) {
    const activeVoiceIds = voices
      .filter((voice) => compare(voice.endQuarter, group.onsetQuarter) > 0)
      .map((voice) => voice.voiceId);

    const candidates = voices
      .filter((voice) => compare(voice.endQuarter, group.onsetQuarter) <= 0)
      .map((voice) => candidateScore(voice, group, { pitchWeight, gapWeight }))
      .sort((a, b) => a.score - b.score || a.voiceId.localeCompare(b.voiceId));

    let preferredVoiceId;
    let creationReason = null;
    let ambiguous = false;

    if (candidates.length === 0) {
      preferredVoiceId = `V${voices.length + 1}`;
      creationReason = voices.length === 0 ? 'INITIAL_VOICE' : 'ACTIVE_POLYPHONY_REQUIRES_ADDITIONAL_STRAND';
      voices.push({
        voiceId: preferredVoiceId,
        endQuarter: group.endQuarter,
        centerPitch: group.centerPitch,
        lastAttackGroupId: group.attackGroupId,
      });
    } else {
      preferredVoiceId = candidates[0].voiceId;
      ambiguous = candidates.length > 1 && (candidates[1].score - candidates[0].score) <= ambiguityMargin;
      if (ambiguous) ambiguousAssignmentCount += 1;
      const voice = voices.find((item) => item.voiceId === preferredVoiceId);
      voice.endQuarter = group.endQuarter;
      voice.centerPitch = group.centerPitch;
      voice.lastAttackGroupId = group.attackGroupId;
    }

    assignments.push(Object.freeze({
      attackGroupId: group.attackGroupId,
      eventIds: group.eventIds,
      midiPitches: group.midiPitches,
      onsetQuarter: group.onsetQuarter,
      endQuarter: group.endQuarter,
      preferredVoiceId,
      authority: 'NON_CANONICAL_HINT',
      activeVoiceIds: Object.freeze(activeVoiceIds),
      candidates: Object.freeze(candidates),
      ambiguous,
      creationReason,
      chordLike: group.chordLike,
      mixedDurations: group.mixedDurations,
      splitHint: group.mixedDurations ? 'SAME_ONSET_MIXED_DURATIONS_MAY_REQUIRE_MULTIPLE_VOICES' : null,
    }));
  }

  const eventVoiceHints = [];
  for (const assignment of assignments) {
    for (const eventId of assignment.eventIds) {
      eventVoiceHints.push(Object.freeze({
        eventId,
        preferredVoiceId: assignment.preferredVoiceId,
        authority: 'NON_CANONICAL_HINT',
        ambiguous: assignment.ambiguous,
      }));
    }
  }

  return Object.freeze({
    schemaVersion: 'voice-candidate-analysis-v0.1',
    analyzerVersion: VOICE_CANDIDATE_ANALYZER_VERSION,
    policy: 'POLYPHONY_IS_DEFAULT',
    voiceCountHint: voices.length,
    assignments: Object.freeze(assignments),
    eventVoiceHints: Object.freeze(eventVoiceHints),
    ambiguousAssignmentCount,
    hasAmbiguousAssignments: ambiguousAssignmentCount > 0,
    options: Object.freeze({ pitchWeight, gapWeight, ambiguityMargin }),
  });
}
