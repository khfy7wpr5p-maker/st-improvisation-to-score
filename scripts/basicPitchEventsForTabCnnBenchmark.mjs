#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { adaptBasicPitchProviderResult } from '../src/adapters/basicPitch.js';

const [providerEntry, audioPath, outputPath] = process.argv.slice(2);
if (!providerEntry || !audioPath || !outputPath) {
  throw new Error('Expected Basic Pitch provider entry, audio path and output JSON path.');
}

const providerModule = await import(pathToFileURL(resolve(providerEntry)).href);
if (typeof providerModule.deriveMidiReferenceFromAudio !== 'function') {
  throw new Error('Pinned Basic Pitch provider does not expose deriveMidiReferenceFromAudio().');
}

const providerResult = providerModule.deriveMidiReferenceFromAudio(resolve(audioPath), {
  sourceId: 's13-2:egset12-01',
  providerConfig: {
    onset_threshold: 0.3,
    frame_threshold: 0.2,
    minimum_note_length: 60,
  },
});

if (!providerResult?.ok) {
  throw new Error(`Basic Pitch benchmark inference failed: ${providerResult?.reason ?? providerResult?.status ?? 'UNKNOWN'}`);
}

const adapted = adaptBasicPitchProviderResult(providerResult);
if (!Array.isArray(adapted.rawEvents) || adapted.rawEvents.length === 0) {
  throw new Error('Basic Pitch benchmark produced no normalized note events.');
}

writeFileSync(resolve(outputPath), JSON.stringify(adapted.rawEvents, null, 2));
process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  audioBytes: readFileSync(resolve(audioPath)).byteLength,
  basicPitchEventCount: adapted.rawEvents.length,
  authority: adapted.provenance.sourceAuthority,
})}\n`);
