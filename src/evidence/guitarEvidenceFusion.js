import { ImprovisationToScoreError } from '../contracts.js';

export const GUITAR_EVIDENCE_FUSION_VERSION = '0.1.0';

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function overlapSeconds(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function representativePitch(observation) {
  if (Number.isInteger(observation.midiPitch)) return observation.midiPitch;
  if (!Array.isArray(observation.pitchContour) || observation.pitchContour.length === 0) return null;
  const values = observation.pitchContour
    .map((point) => Number(point.midiPitchFloat))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor((values.length - 1) / 2)];
}

function validateBaseEvent(event, index) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    fail('INVALID_GUITAR_EVIDENCE_FUSION_INPUT', 'Base event must be an object.', { index });
  }
  if (typeof event.eventId !== 'string' || !event.eventId) {
    fail('INVALID_GUITAR_EVIDENCE_FUSION_INPUT', 'Base event requires eventId.', { index });
  }
  if (!Number.isInteger(event.midiPitch) || event.midiPitch < 0 || event.midiPitch > 127) {
    fail('INVALID_GUITAR_EVIDENCE_FUSION_INPUT', 'Base event midiPitch must be 0..127.', { index });
  }
  if (!Number.isFinite(event.onsetSeconds) || !Number.isFinite(event.offsetSeconds) || event.onsetSeconds < 0 || event.offsetSeconds <= event.onsetSeconds) {
    fail('INVALID_GUITAR_EVIDENCE_FUSION_INPUT', 'Base event timing must be finite and positive.', { index });
  }
}

function candidateScore(baseEvent, observation, options) {
  const pitch = representativePitch(observation);
  if (pitch === null) return null;
  const pitchDistance = Math.abs(baseEvent.midiPitch - pitch);
  if (pitchDistance > options.pitchToleranceSemitones) return null;

  const overlap = overlapSeconds(
    baseEvent.onsetSeconds,
    baseEvent.offsetSeconds,
    observation.onsetSeconds,
    observation.offsetSeconds,
  );
  const onsetDelta = Math.abs(baseEvent.onsetSeconds - observation.onsetSeconds);
  if (overlap <= 0 && onsetDelta > options.onsetToleranceSeconds) return null;

  const duration = Math.max(1e-9, baseEvent.offsetSeconds - baseEvent.onsetSeconds);
  const overlapRatio = overlap / duration;
  const confidence = observation.confidence == null ? 0.5 : observation.confidence;
  const score = pitchDistance * 2 + onsetDelta - overlapRatio - confidence * 0.25;
  return { score, pitchDistance, onsetDelta, overlapSeconds: overlap, overlapRatio };
}

function normalizeOptions(input = {}) {
  const onsetToleranceSeconds = input.onsetToleranceSeconds == null ? 0.08 : Number(input.onsetToleranceSeconds);
  const pitchToleranceSemitones = input.pitchToleranceSemitones == null ? 1 : Number(input.pitchToleranceSemitones);
  if (!Number.isFinite(onsetToleranceSeconds) || onsetToleranceSeconds < 0 || onsetToleranceSeconds > 1) {
    fail('INVALID_GUITAR_EVIDENCE_FUSION_OPTIONS', 'onsetToleranceSeconds must be in 0..1.');
  }
  if (!Number.isFinite(pitchToleranceSemitones) || pitchToleranceSemitones < 0 || pitchToleranceSemitones > 12) {
    fail('INVALID_GUITAR_EVIDENCE_FUSION_OPTIONS', 'pitchToleranceSemitones must be in 0..12.');
  }
  return Object.freeze({ onsetToleranceSeconds, pitchToleranceSemitones });
}

function stringFretKey(match) {
  if (match.stringIndex == null || match.fret == null) return null;
  return `${match.stringIndex}:${match.fret}`;
}

export function fuseGuitarEvidence(baseEventsInput, evidenceBatchesInput = [], optionsInput = {}) {
  if (!Array.isArray(baseEventsInput)) fail('INVALID_GUITAR_EVIDENCE_FUSION_INPUT', 'baseEvents must be an array.');
  if (!Array.isArray(evidenceBatchesInput)) fail('INVALID_GUITAR_EVIDENCE_FUSION_INPUT', 'evidenceBatches must be an array.');
  const baseEvents = [...baseEventsInput];
  baseEvents.forEach(validateBaseEvent);
  const options = normalizeOptions(optionsInput);

  const providerIds = new Set();
  const allEvidence = [];
  for (const batch of evidenceBatchesInput) {
    if (!batch || typeof batch !== 'object' || batch.authority !== 'SHADOW_EVIDENCE_ONLY' || !Array.isArray(batch.observations)) {
      fail('INVALID_GUITAR_EVIDENCE_BATCH', 'Fusion accepts only normalized SHADOW_EVIDENCE_ONLY batches.');
    }
    providerIds.add(batch.providerId);
    for (const observation of batch.observations) allEvidence.push(observation);
  }

  const assignments = new Map(baseEvents.map((event) => [event.eventId, []]));
  const unmatchedEvidence = [];

  for (const observation of allEvidence) {
    const candidates = baseEvents
      .map((event) => ({ event, match: candidateScore(event, observation, options) }))
      .filter((item) => item.match !== null)
      .sort((a, b) => a.match.score - b.match.score || a.event.eventId.localeCompare(b.event.eventId));

    if (candidates.length === 0) {
      unmatchedEvidence.push(observation.evidenceId);
      continue;
    }
    const winner = candidates[0];
    assignments.get(winner.event.eventId).push(Object.freeze({
      evidenceId: observation.evidenceId,
      providerId: observation.providerId,
      confidence: observation.confidence,
      midiPitch: observation.midiPitch,
      stringIndex: observation.stringIndex,
      fret: observation.fret,
      technique: observation.technique,
      hasPitchContour: observation.pitchContour.length > 0,
      pitchDistance: winner.match.pitchDistance,
      onsetDeltaSeconds: winner.match.onsetDelta,
      overlapSeconds: winner.match.overlapSeconds,
      overlapRatio: winner.match.overlapRatio,
    }));
  }

  let supportedEventCount = 0;
  let multiProviderSupportedEventCount = 0;
  let positionDisagreementEventCount = 0;
  let contourSupportedEventCount = 0;

  const eventEvidence = baseEvents.map((event) => {
    const matches = assignments.get(event.eventId) ?? [];
    const supportProviderIds = [...new Set(matches.map((match) => match.providerId))].sort();
    const positionKeys = [...new Set(matches.map(stringFretKey).filter(Boolean))];
    const positionDisagreement = positionKeys.length > 1;
    const hasContourSupport = matches.some((match) => match.hasPitchContour);
    if (matches.length > 0) supportedEventCount += 1;
    if (supportProviderIds.length > 1) multiProviderSupportedEventCount += 1;
    if (positionDisagreement) positionDisagreementEventCount += 1;
    if (hasContourSupport) contourSupportedEventCount += 1;

    return Object.freeze({
      eventId: event.eventId,
      midiPitch: event.midiPitch,
      onsetSeconds: event.onsetSeconds,
      supportCount: matches.length,
      supportProviderIds: Object.freeze(supportProviderIds),
      consensus: supportProviderIds.length > 1 ? 'MULTI_PROVIDER' : supportProviderIds.length === 1 ? 'SINGLE_PROVIDER' : 'NONE',
      positionDisagreement,
      hasContourSupport,
      matches: Object.freeze(matches),
    });
  });

  return Object.freeze({
    schemaVersion: 'guitar-evidence-fusion-v0.1',
    fusionVersion: GUITAR_EVIDENCE_FUSION_VERSION,
    authority: 'SHADOW_EVIDENCE_ONLY',
    policy: 'EVIDENCE_MAY_OBSERVE_BUT_MUST_NOT_MUTATE_SCORE',
    providerIds: Object.freeze([...providerIds].sort()),
    options,
    eventEvidence: Object.freeze(eventEvidence),
    unmatchedEvidenceIds: Object.freeze(unmatchedEvidence),
    summary: Object.freeze({
      baseEventCount: baseEvents.length,
      providerCount: providerIds.size,
      evidenceObservationCount: allEvidence.length,
      supportedEventCount,
      multiProviderSupportedEventCount,
      positionDisagreementEventCount,
      contourSupportedEventCount,
      unmatchedEvidenceCount: unmatchedEvidence.length,
    }),
  });
}
