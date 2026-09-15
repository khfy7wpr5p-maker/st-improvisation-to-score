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

test('score draft exposes sonority evidence for sustained overlap', () => {
  const draft = buildScoreDraft([
    { eventId: 'bass', midiPitch: 48, onsetSeconds: 0, offsetSeconds: 1.0 },
    { eventId: 'upper', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 0.75 },
  ], context);

  assert.equal(draft.status, 'REVIEW_REQUIRED');
  assert.equal(draft.polyphony.hasSustainedOverlap, true);
  assert.equal(draft.polyphony.sustainedOverlapCount, 1);
  assert.ok(draft.polyphony.spans.some((span) => span.classification === 'SUSTAINED_OVERLAP'));
});
