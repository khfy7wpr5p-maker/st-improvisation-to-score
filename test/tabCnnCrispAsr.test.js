import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  parseCrispAsrTabJson,
  projectTabCnnFramesToPredictions,
} from '../src/index.js';

async function fixture() {
  return JSON.parse(await readFile(
    new URL('../fixtures/provider-host/tabcnn-crispasr-json.json', import.meta.url),
    'utf8',
  ));
}

test('parses six-string CrispASR TabCNN frame evidence as shadow evidence', async () => {
  const parsed = parseCrispAsrTabJson(await fixture());

  assert.equal(parsed.nStrings, 6);
  assert.equal(parsed.nClasses, 21);
  assert.equal(parsed.silentClass, 20);
  assert.ok(parsed.framePeriodSeconds > 0);
  assert.equal(parsed.authority, 'SHADOW_EVIDENCE_ONLY');
  assert.equal(parsed.frames.length, 2);
  assert.ok(Object.isFrozen(parsed));
});

test('projects non-silent frame decisions to one-frame string/fret observations', async () => {
  const parsed = parseCrispAsrTabJson(await fixture());
  const predictions = projectTabCnnFramesToPredictions(parsed);

  assert.equal(predictions.length, 4);
  assert.deepEqual(
    predictions.map((p) => [p.stringIndex, p.fret, p.midiPitch]),
    [
      [1, 1, 41],
      [6, 0, 64],
      [1, 1, 41],
      [4, 2, 57],
    ],
  );
  assert.ok(predictions.every((p) => Number.isFinite(p.onsetSeconds)));
  assert.ok(predictions.every((p) => p.offsetSeconds > p.onsetSeconds));
  assert.ok(predictions.every((p) => p.metadata.sourceShape === 'CRISPASR_TABCNN_FRAME_EMISSION'));
  assert.ok(predictions.every((p) => p.confidence == null || (p.confidence >= 0 && p.confidence <= 1)));
});

test('preserves the raw frame record for provenance', async () => {
  const parsed = parseCrispAsrTabJson(await fixture());
  const predictions = projectTabCnnFramesToPredictions(parsed);

  assert.deepEqual(predictions[0].metadata.rawFrame, parsed.frames[0]);
  assert.equal(predictions[0].metadata.frameIndex, 0);
  assert.equal(predictions[0].metadata.providerStringIndex0Based, 0);
});

test('rejects malformed dimensions instead of fabricating evidence', async () => {
  const raw = await fixture();

  assert.throws(
    () => parseCrispAsrTabJson({ ...raw, n_strings: 5 }),
    /n_strings/,
  );

  assert.throws(
    () => parseCrispAsrTabJson({
      ...raw,
      frames: [{ ...raw.frames[0], frets: raw.frames[0].frets.slice(0, 5) }],
    }),
    /frets/,
  );
});
