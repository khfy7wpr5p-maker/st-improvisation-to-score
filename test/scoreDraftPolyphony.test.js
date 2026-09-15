import test from 'node:test';
import assert from 'node:assert/strict';

import { buildScoreDraft } from '../src/index.js';

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

test('score draft exposes sustained-overlap evidence without treating normal polyphony as review failure', () => {
  const draft = buildScoreDraft([
    { eventId: 'bass', midiPitch: 48, onsetSeconds: 0, offsetSeconds: 1.0 },
    { eventId: 'upper', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 0.75 },
  ], context);

  assert.equal(draft.status, 'PASS');
  assert.equal(draft.polyphonyPolicy, 'POLYPHONY_IS_DEFAULT');
  assert.equal(draft.polyphony.hasSustainedOverlap, true);
  assert.equal(draft.polyphony.sustainedOverlapCount, 1);
  assert.ok(draft.polyphony.spans.some((span) => span.classification === 'SUSTAINED_OVERLAP'));
  assert.equal(draft.voiceCandidates.voiceCountHint, 2);
  assert.equal(draft.diagnostics.some((item) => item.code === 'POLYPHONIC_OVERLAP_REQUIRES_REVIEW'), false);
});
