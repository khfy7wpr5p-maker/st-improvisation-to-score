import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptBrowserBasicPitchNoteEvents,
  adaptFretNetShadowEvidence,
  adaptTabCnnShadowEvidence,
  buildLearnedGuitarEvidenceShadow,
  fuseGuitarEvidence,
} from '../src/index.js';

function basicPitchEvents() {
  return adaptBrowserBasicPitchNoteEvents([
    { startTimeSeconds: 0, durationSeconds: 0.5, pitchMidi: 64, amplitude: 0.8 },
    { startTimeSeconds: 0.5, durationSeconds: 0.5, pitchMidi: 67, amplitude: 0.8 },
  ]).rawEvents;
}

test('S13 TabCNN and FretNet support the same Basic Pitch event without mutating source truth', () => {
  const baseEvents = basicPitchEvents();
  const snapshot = JSON.stringify(baseEvents);
  const result = buildLearnedGuitarEvidenceShadow({
    basicPitchEvents: baseEvents,
    tabCnn: {
      providerVersion: 'fixture',
      predictions: [{
        onsetSeconds: 0.01,
        offsetSeconds: 0.49,
        midiPitch: 64,
        stringIndex: 1,
        fret: 0,
        confidence: 0.85,
      }],
    },
    fretNet: {
      providerVersion: 'fixture',
      notes: [{
        onsetSeconds: 0.0,
        offsetSeconds: 0.5,
        midiPitch: 64,
        stringIndex: 1,
        fret: 0,
        confidence: 0.9,
        pitchContour: [
          { timeSeconds: 0.1, midiPitchFloat: 64.02, confidence: 0.9 },
          { timeSeconds: 0.3, midiPitchFloat: 63.98, confidence: 0.88 },
        ],
      }],
    },
  });

  assert.equal(JSON.stringify(baseEvents), snapshot);
  assert.equal(result.authority, 'SHADOW_EVIDENCE_ONLY');
  assert.equal(result.fusion.summary.providerCount, 2);
  assert.equal(result.fusion.summary.supportedEventCount, 1);
  assert.equal(result.fusion.summary.multiProviderSupportedEventCount, 1);
  assert.equal(result.fusion.summary.contourSupportedEventCount, 1);
  assert.equal(result.fusion.eventEvidence[0].consensus, 'MULTI_PROVIDER');
  assert.deepEqual(result.fusion.eventEvidence[0].supportProviderIds, ['fretnet', 'tabcnn']);
});

test('S13 fusion records alternate string/fret evidence as disagreement rather than deleting the note', () => {
  const baseEvents = basicPitchEvents();
  const tabCnn = adaptTabCnnShadowEvidence({ predictions: [{
    onsetSeconds: 0,
    offsetSeconds: 0.5,
    midiPitch: 64,
    stringIndex: 1,
    fret: 0,
    confidence: 0.8,
  }] });
  const fretNet = adaptFretNetShadowEvidence({ notes: [{
    onsetSeconds: 0,
    offsetSeconds: 0.5,
    midiPitch: 64,
    stringIndex: 2,
    fret: 5,
    confidence: 0.8,
  }] });
  const fusion = fuseGuitarEvidence(baseEvents, [tabCnn, fretNet]);

  assert.equal(fusion.eventEvidence[0].positionDisagreement, true);
  assert.equal(fusion.summary.positionDisagreementEventCount, 1);
  assert.equal(fusion.eventEvidence[0].supportCount, 2);
  assert.equal(baseEvents.length, 2);
});

test('S13 unmatched learned evidence remains explicit and non-destructive', () => {
  const baseEvents = basicPitchEvents();
  const tabCnn = adaptTabCnnShadowEvidence({ predictions: [{
    onsetSeconds: 2,
    offsetSeconds: 2.5,
    midiPitch: 40,
    stringIndex: 6,
    fret: 0,
    confidence: 0.95,
  }] });
  const fusion = fuseGuitarEvidence(baseEvents, [tabCnn]);

  assert.equal(fusion.summary.unmatchedEvidenceCount, 1);
  assert.equal(fusion.summary.supportedEventCount, 0);
  assert.equal(fusion.eventEvidence.every((item) => item.consensus === 'NONE'), true);
});
