import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendTeacherCorrection,
  applyTeacherCorrectionOverlay,
  buildScoreDraft,
  createTeacherCorrectionLedger,
  rational,
  revertTeacherCorrection,
  serializeScoreDraftToMusicXml,
} from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

function correction(correctionId, targetId, dimension, before, after) {
  return {
    correctionId,
    actorId: 'teacher-1',
    target: { kind: 'SOURCE_EVENT', id: targetId },
    dimension,
    before,
    after,
  };
}

test('teacher pitch/rhythm overlay rebuilds score while preserving the original machine draft', () => {
  const source = buildScoreDraft([
    { eventId: 'n1', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.5 },
    { eventId: 'n2', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 1.0 },
  ], context);
  let ledger = createTeacherCorrectionLedger({ ledgerId: 'L1' });
  ledger = appendTeacherCorrection(ledger, correction('c1', 'n1', 'PITCH', 60, 62));
  ledger = appendTeacherCorrection(ledger, correction('c2', 'n2', 'RHYTHM', {
    onsetQuarter: rational(1, 1), durationQuarter: rational(1, 1),
  }, {
    onsetQuarter: rational(3, 2), durationQuarter: rational(1, 2),
  }));

  const result = applyTeacherCorrectionOverlay(source, ledger);
  assert.equal(source.quantizedEvents.find((event) => event.eventId === 'n1').midiPitch, 60);
  assert.equal(result.correctedDraft.quantizedEvents.find((event) => event.eventId === 'n1').midiPitch, 62);
  assert.deepEqual(result.correctedDraft.quantizedEvents.find((event) => event.eventId === 'n2').onsetQuarter, rational(3, 2));
  assert.deepEqual(result.correctedDraft.quantizedEvents.find((event) => event.eventId === 'n2').durationQuarter, rational(1, 2));
  assert.equal(result.appliedCorrections.length, 2);
  assert.equal(result.correctedDraft.teacherOverlay.authority, 'TEACHER_CONFIRMED');
  assert.equal(result.correctedDraft.measureTopology.measures.length, source.measureTopology.measures.length);
});

test('teacher voice correction overrides heuristic voice hint without deleting polyphonic evidence', () => {
  const source = buildScoreDraft([
    { eventId: 'c4', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 1 },
    { eventId: 'g4', midiPitch: 67, onsetSeconds: 0, offsetSeconds: 1 },
  ], context);
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'voice-ledger',
    entries: [correction('voice-1', 'g4', 'VOICE_ID', 'V1', 'V2')],
  });
  const result = applyTeacherCorrectionOverlay(source, ledger);
  const segment = result.correctedDraft.polyphonicProjection.segments.find((item) => item.sourceEventId === 'g4');

  assert.equal(segment.voiceId, 'V2');
  assert.equal(segment.voiceAuthority, 'TEACHER_CONFIRMED');
  assert.equal(result.correctedDraft.polyphonicProjection.voiceCount, 2);
});

test('reverting a correction restores the machine-derived value on rebuild', () => {
  const source = buildScoreDraft([
    { eventId: 'n1', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.5 },
  ], context);
  let ledger = createTeacherCorrectionLedger({ ledgerId: 'revert-ledger' });
  ledger = appendTeacherCorrection(ledger, correction('pitch-change', 'n1', 'PITCH', 60, 65));
  ledger = revertTeacherCorrection(ledger, 'pitch-change', { correctionId: 'undo-pitch' });

  const result = applyTeacherCorrectionOverlay(source, ledger);
  assert.equal(result.correctedDraft.quantizedEvents[0].midiPitch, 60);
  assert.equal(result.appliedCorrections.length, 0);
  assert.equal(result.ledger.entries.length, 2);
});

test('teacher can delete a spurious event and add a missing event in one reversible overlay', () => {
  const source = buildScoreDraft([
    { eventId: 'keep', midiPitch: 60, onsetSeconds: 0, offsetSeconds: 0.5 },
    { eventId: 'false-positive', midiPitch: 61, onsetSeconds: 0.5, offsetSeconds: 1.0 },
  ], context);
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'event-ledger',
    entries: [
      correction('delete-1', 'false-positive', 'REMOVE_EVENT', { exists: true }, { exists: false }),
      {
        correctionId: 'add-1',
        actorId: 'teacher-1',
        target: { kind: 'SCORE', id: 'score' },
        dimension: 'ADD_EVENT',
        before: null,
        after: {
          eventId: 'missing-note',
          midiPitch: 67,
          onsetQuarter: rational(1, 1),
          durationQuarter: rational(1, 1),
        },
      },
    ],
  });

  const result = applyTeacherCorrectionOverlay(source, ledger);
  assert.equal(result.correctedDraft.quantizedEvents.some((event) => event.eventId === 'false-positive'), false);
  assert.equal(result.correctedDraft.quantizedEvents.some((event) => event.eventId === 'missing-note'), true);
  assert.equal(source.quantizedEvents.some((event) => event.eventId === 'false-positive'), true);
  assert.equal(result.appliedCorrections.length, 2);
});

test('unsupported notation correction is preserved as a warning and does not block editable/exportable draft', () => {
  const source = buildScoreDraft([
    { eventId: 'n1', midiPitch: 61, onsetSeconds: 0, offsetSeconds: 0.5 },
  ], context);
  const ledger = createTeacherCorrectionLedger({
    ledgerId: 'notation-ledger',
    entries: [correction('spell-1', 'n1', 'ENHARMONIC_SPELLING', 'C#4', 'Db4')],
  });

  const result = applyTeacherCorrectionOverlay(source, ledger);
  const xml = serializeScoreDraftToMusicXml(result.correctedDraft);
  assert.equal(result.appliedCorrections.length, 0);
  assert.equal(result.unappliedCorrections.length, 1);
  assert.equal(result.unappliedCorrections[0].code, 'TEACHER_OVERLAY_DIMENSION_NOT_YET_MATERIALIZED');
  assert.match(xml, /<score-partwise version="4\.0">/);
});
