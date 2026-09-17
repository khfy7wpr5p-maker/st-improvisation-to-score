import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  runExternalGuitarEvidenceProvider,
  runProviderHostedLearnedGuitarEvidence,
} from '../src/index.js';

const fixture = fileURLToPath(new URL('./fixtures/learnedProviderHostFixture.mjs', import.meta.url));

function baseEvent() {
  return Object.freeze({
    eventId: 'bp:0',
    midiPitch: 64,
    onsetSeconds: 0,
    offsetSeconds: 0.5,
    confidence: null,
    amplitude: 0.8,
    sourceEventId: 'source:0',
  });
}

test('S13.1 executes configured TabCNN and FretNet subprocess hosts and fuses shadow evidence', async () => {
  const event = baseEvent();
  const snapshot = JSON.stringify(event);
  const result = await runProviderHostedLearnedGuitarEvidence({
    audioPath: '/tmp/example.wav',
    basicPitchEvents: [event],
    tabCnnHost: { command: process.execPath, args: [fixture] },
    fretNetHost: { command: process.execPath, args: [fixture] },
  });

  assert.equal(result.summary.configuredProviderCount, 2);
  assert.equal(result.summary.readyProviderCount, 2);
  assert.equal(result.summary.supportedEventCount, 1);
  assert.equal(result.summary.multiProviderSupportedEventCount, 1);
  assert.equal(result.summary.contourSupportedEventCount, 1);
  assert.equal(result.shadow.authority, 'SHADOW_EVIDENCE_ONLY');
  assert.equal(JSON.stringify(event), snapshot);
});

test('S13.1 treats a missing executable as unavailable instead of blocking score work', async () => {
  const result = await runExternalGuitarEvidenceProvider({
    providerId: 'tabcnn',
    audioPath: '/tmp/example.wav',
    command: '__st_missing_provider_executable__',
    timeoutMs: 1000,
  });

  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason, 'EXECUTABLE_NOT_FOUND');
});

test('S13.1 keeps fusion useful when only one provider host is available', async () => {
  const result = await runProviderHostedLearnedGuitarEvidence({
    audioPath: '/tmp/example.wav',
    basicPitchEvents: [baseEvent()],
    tabCnnHost: { command: process.execPath, args: [fixture] },
    fretNetHost: { command: '__st_missing_provider_executable__', timeoutMs: 1000 },
  });

  assert.equal(result.summary.readyProviderCount, 1);
  assert.equal(result.summary.unavailableProviderCount, 1);
  assert.equal(result.summary.supportedEventCount, 1);
  assert.equal(result.shadow.fusion.eventEvidence[0].consensus, 'SINGLE_PROVIDER');
});
