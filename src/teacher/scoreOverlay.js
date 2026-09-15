import { ImprovisationToScoreError, rational } from '../contracts.js';
import { buildScoreDraftFromQuantizedEvents } from '../scoreDraft.js';
import {
  TEACHER_CORRECTION_AUTHORITY,
  createTeacherCorrectionLedger,
} from './correctionLedger.js';

export const TEACHER_SCORE_OVERLAY_VERSION = '0.1.0';
export const TEACHER_SCORE_OVERLAY_AUTHORITY = TEACHER_CORRECTION_AUTHORITY;
export const TEACHER_SCORE_OVERLAY_MAX_APPLIED = 100_000;

function warning(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

function decimalRational(value, field, { positive = false } = {}) {
  let out;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ImprovisationToScoreError('INVALID_TEACHER_OVERLAY_VALUE', `${field} must be finite.`);
    const scale = 1_000_000;
    out = rational(Math.round(value * scale), scale);
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    out = rational(value.numerator, value.denominator);
  } else {
    throw new ImprovisationToScoreError('INVALID_TEACHER_OVERLAY_VALUE', `${field} must be a number or rational object.`);
  }
  if (positive ? out.numerator <= 0 : out.numerator < 0) {
    throw new ImprovisationToScoreError('INVALID_TEACHER_OVERLAY_VALUE', `${field} must be ${positive ? 'positive' : 'non-negative'}.`);
  }
  return out;
}

function afterField(entry, names) {
  if (entry.after && typeof entry.after === 'object' && !Array.isArray(entry.after)) {
    for (const name of names) if (Object.hasOwn(entry.after, name)) return entry.after[name];
  }
  return entry.after;
}

function correctedPitch(entry) {
  const value = afterField(entry, ['midiPitch', 'pitch']);
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new ImprovisationToScoreError('INVALID_TEACHER_PITCH', 'Teacher pitch correction must resolve to MIDI 0..127.');
  }
  return value;
}

function correctedVoice(entry) {
  const value = afterField(entry, ['voiceId', 'voice']);
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 96) {
    throw new ImprovisationToScoreError('INVALID_TEACHER_VOICE', 'Teacher voice correction must be a non-empty bounded voice id.');
  }
  return value.trim();
}

function correctionMode(entry) {
  const dimension = entry.dimension.toUpperCase();
  if (dimension.includes('DELETE') || dimension.includes('REMOVE') || dimension.includes('OMIT')) return 'DELETE_EVENT';
  if (dimension.includes('ADD_EVENT') || dimension.includes('MISSING_EVENT') || dimension.includes('INSERT_EVENT')) return 'ADD_EVENT';
  if (dimension.includes('VOICE')) return 'VOICE';
  if (dimension.includes('PITCH')) return 'PITCH';
  if (dimension.includes('RHYTHM') || dimension.includes('QUANT')) return 'RHYTHM';
  if (dimension.includes('ONSET') || dimension.includes('ATTACK')) return 'ONSET';
  if (dimension.includes('DURATION') || dimension.includes('OFFSET')) return 'DURATION';
  return 'UNSUPPORTED';
}

function addedEventFromCorrection(entry) {
  const after = entry.after;
  if (!after || typeof after !== 'object' || Array.isArray(after)) {
    throw new ImprovisationToScoreError('INVALID_TEACHER_ADDED_EVENT', 'ADD_EVENT correction requires an object in after.');
  }
  const eventId = typeof after.eventId === 'string' && after.eventId.trim()
    ? after.eventId.trim()
    : (entry.target.kind.toUpperCase().includes('EVENT') ? entry.target.id : `teacher:${entry.correctionId}`);
  if (eventId.length > 160) throw new ImprovisationToScoreError('INVALID_TEACHER_ADDED_EVENT', 'Added eventId is too long.');
  const midiPitch = correctedPitch({ ...entry, after });
  const onsetQuarter = decimalRational(after.onsetQuarter ?? after.onset, 'addedEvent.onsetQuarter');
  const durationQuarter = decimalRational(after.durationQuarter ?? after.duration, 'addedEvent.durationQuarter', { positive: true });
  return Object.freeze({
    eventId,
    midiPitch,
    onsetQuarter,
    durationQuarter,
    sourceOnsetSeconds: Number.isFinite(after.sourceOnsetSeconds) ? after.sourceOnsetSeconds : null,
    sourceDurationSeconds: Number.isFinite(after.sourceDurationSeconds) ? after.sourceDurationSeconds : null,
    confidence: Number.isFinite(after.confidence) ? after.confidence : null,
    amplitude: Number.isFinite(after.amplitude) ? after.amplitude : null,
    sourceEventId: after.sourceEventId ?? `teacher:${entry.correctionId}`,
    quantizationErrorQuarter: Object.freeze({ onset: 0, duration: 0 }),
    teacherAuthority: TEACHER_SCORE_OVERLAY_AUTHORITY,
    teacherCorrectionId: entry.correctionId,
  });
}

function sourceExtent(draft) {
  const measures = draft.measureTopology?.measures ?? draft.measures ?? [];
  const last = measures.at(-1);
  return last?.endQuarter ?? rational(0, 1);
}

function sourcePickupLength(draft) {
  const first = draft.measureTopology?.measures?.[0];
  return first?.isPickup ? first.lengthQuarter : undefined;
}

function cloneEvent(event) {
  return Object.freeze({ ...event });
}

function effect(entry, mode, details = {}) {
  return Object.freeze({
    correctionId: entry.correctionId,
    sequence: entry.sequence,
    target: entry.target,
    dimension: entry.dimension,
    category: entry.category,
    mode,
    details: Object.freeze({ ...details }),
  });
}

export function applyTeacherCorrectionOverlay(sourceDraft, ledgerInput, options = {}) {
  if (!sourceDraft || typeof sourceDraft !== 'object' || !Array.isArray(sourceDraft.quantizedEvents) || !sourceDraft.context || !sourceDraft.timingMap) {
    throw new ImprovisationToScoreError('INVALID_SOURCE_SCORE_DRAFT', 'Teacher overlay requires a ScoreDraft with quantizedEvents, context and timingMap.');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new ImprovisationToScoreError('INVALID_TEACHER_OVERLAY_OPTIONS', 'Teacher overlay options must be a plain object.');
  }

  const ledger = createTeacherCorrectionLedger(ledgerInput);
  if (ledger.activeCorrections.length > TEACHER_SCORE_OVERLAY_MAX_APPLIED) {
    throw new ImprovisationToScoreError('TEACHER_OVERLAY_LIMIT_EXCEEDED', 'Active correction count exceeds overlay resource limits.');
  }

  const eventMap = new Map(sourceDraft.quantizedEvents.map((event) => [event.eventId, cloneEvent(event)]));
  const voiceOverrides = new Map();
  const applied = [];
  const unapplied = [];

  for (const entry of ledger.activeCorrections) {
    const mode = correctionMode(entry);
    try {
      if (mode === 'ADD_EVENT') {
        const event = addedEventFromCorrection(entry);
        if (eventMap.has(event.eventId)) {
          unapplied.push(warning('TEACHER_ADD_EVENT_ID_ALREADY_EXISTS', 'Added teacher event id already exists; correction remains in the ledger but was not overlaid.', {
            correctionId: entry.correctionId,
            eventId: event.eventId,
          }));
          continue;
        }
        eventMap.set(event.eventId, event);
        applied.push(effect(entry, mode, { eventId: event.eventId }));
        continue;
      }

      const targetId = entry.target.id;
      const current = eventMap.get(targetId);
      if (!current) {
        unapplied.push(warning('TEACHER_OVERLAY_TARGET_NOT_FOUND', 'Active correction target is not present in the current score state.', {
          correctionId: entry.correctionId,
          targetId,
          mode,
        }));
        continue;
      }

      if (mode === 'DELETE_EVENT') {
        eventMap.delete(targetId);
        voiceOverrides.delete(targetId);
        applied.push(effect(entry, mode, { eventId: targetId }));
        continue;
      }
      if (mode === 'PITCH') {
        const midiPitch = correctedPitch(entry);
        eventMap.set(targetId, Object.freeze({ ...current, midiPitch, teacherAuthority: TEACHER_SCORE_OVERLAY_AUTHORITY, teacherCorrectionId: entry.correctionId }));
        applied.push(effect(entry, mode, { eventId: targetId, midiPitch }));
        continue;
      }
      if (mode === 'ONSET') {
        const onsetQuarter = decimalRational(afterField(entry, ['onsetQuarter', 'onset']), 'onsetQuarter');
        eventMap.set(targetId, Object.freeze({ ...current, onsetQuarter, teacherAuthority: TEACHER_SCORE_OVERLAY_AUTHORITY, teacherCorrectionId: entry.correctionId }));
        applied.push(effect(entry, mode, { eventId: targetId, onsetQuarter }));
        continue;
      }
      if (mode === 'DURATION') {
        const durationQuarter = decimalRational(afterField(entry, ['durationQuarter', 'duration']), 'durationQuarter', { positive: true });
        eventMap.set(targetId, Object.freeze({ ...current, durationQuarter, teacherAuthority: TEACHER_SCORE_OVERLAY_AUTHORITY, teacherCorrectionId: entry.correctionId }));
        applied.push(effect(entry, mode, { eventId: targetId, durationQuarter }));
        continue;
      }
      if (mode === 'RHYTHM') {
        const after = entry.after;
        if (!after || typeof after !== 'object' || Array.isArray(after)) {
          throw new ImprovisationToScoreError('INVALID_TEACHER_RHYTHM', 'Rhythm correction requires an object containing onsetQuarter and/or durationQuarter.');
        }
        let next = current;
        const changed = {};
        if (after.onsetQuarter !== undefined || after.onset !== undefined) {
          changed.onsetQuarter = decimalRational(after.onsetQuarter ?? after.onset, 'rhythm.onsetQuarter');
          next = { ...next, onsetQuarter: changed.onsetQuarter };
        }
        if (after.durationQuarter !== undefined || after.duration !== undefined) {
          changed.durationQuarter = decimalRational(after.durationQuarter ?? after.duration, 'rhythm.durationQuarter', { positive: true });
          next = { ...next, durationQuarter: changed.durationQuarter };
        }
        if (Object.keys(changed).length === 0) throw new ImprovisationToScoreError('INVALID_TEACHER_RHYTHM', 'Rhythm correction did not contain an applicable timing field.');
        eventMap.set(targetId, Object.freeze({ ...next, teacherAuthority: TEACHER_SCORE_OVERLAY_AUTHORITY, teacherCorrectionId: entry.correctionId }));
        applied.push(effect(entry, mode, { eventId: targetId, ...changed }));
        continue;
      }
      if (mode === 'VOICE') {
        const voiceId = correctedVoice(entry);
        voiceOverrides.set(targetId, voiceId);
        applied.push(effect(entry, mode, { eventId: targetId, voiceId }));
        continue;
      }

      unapplied.push(warning('TEACHER_OVERLAY_DIMENSION_NOT_YET_MATERIALIZED', 'Correction is preserved in the ledger but this score overlay does not yet materialize that dimension.', {
        correctionId: entry.correctionId,
        dimension: entry.dimension,
        category: entry.category,
      }));
    } catch (error) {
      if (!(error instanceof ImprovisationToScoreError)) throw error;
      unapplied.push(warning('TEACHER_OVERLAY_CORRECTION_SKIPPED', error.message, {
        correctionId: entry.correctionId,
        errorCode: error.code,
      }));
    }
  }

  const rebuilt = buildScoreDraftFromQuantizedEvents([...eventMap.values()], sourceDraft.context, {
    timingMap: sourceDraft.timingMap,
    pickupLengthQuarter: sourcePickupLength(sourceDraft),
    minimumEndQuarter: options.preserveSourceExtent === false ? undefined : sourceExtent(sourceDraft),
    maxMeasures: options.maxMeasures,
    voiceHintOverrides: voiceOverrides,
  });
  const overlayMetadata = Object.freeze({
    schemaVersion: 'teacher-score-overlay-metadata-v0.1',
    overlayVersion: TEACHER_SCORE_OVERLAY_VERSION,
    authority: TEACHER_SCORE_OVERLAY_AUTHORITY,
    ledgerId: ledger.ledgerId,
    ledgerRevision: ledger.revision,
    appliedCorrectionIds: Object.freeze(applied.map((item) => item.correctionId)),
    unappliedCorrectionCount: unapplied.length,
    sourceDraftSchemaVersion: sourceDraft.schemaVersion ?? null,
  });
  const correctedDraft = Object.freeze({ ...rebuilt, teacherOverlay: overlayMetadata });

  return Object.freeze({
    schemaVersion: 'teacher-score-overlay-result-v0.1',
    overlayVersion: TEACHER_SCORE_OVERLAY_VERSION,
    authority: TEACHER_SCORE_OVERLAY_AUTHORITY,
    sourceDraft,
    correctedDraft,
    ledger,
    appliedCorrections: Object.freeze(applied),
    unappliedCorrections: Object.freeze(unapplied),
    warnings: Object.freeze(unapplied),
  });
}
