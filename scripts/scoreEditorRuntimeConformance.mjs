import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildScoreDraft,
  exportMusicXmlFromEditor,
  openScoreDraftInEditor,
} from '../src/index.js';

const sdkEntry = process.argv[2];
if (!sdkEntry) throw new Error('Score Editor public SDK entry path is required.');

const sdkModule = await import(pathToFileURL(resolve(sdkEntry)).href);
if (typeof sdkModule.createScoreEditorSdkV1 !== 'function') {
  throw new Error('Pinned Score Editor public entry does not export createScoreEditorSdkV1().');
}

const sdk = sdkModule.createScoreEditorSdkV1();
if (sdk.version !== '1.0.0') throw new Error(`Unexpected Score Editor SDK version: ${sdk.version}`);
if (sdk.supports('document') !== true) throw new Error('Pinned Score Editor SDK lacks document capability.');

const sha256Hex = async (text) => createHash('sha256').update(new TextEncoder().encode(text)).digest('hex');

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

const draft = buildScoreDraft([
  { eventId: 'bass', midiPitch: 48, onsetSeconds: 0, offsetSeconds: 2.0 },
  { eventId: 'upper-1', midiPitch: 64, onsetSeconds: 0.5, offsetSeconds: 0.75 },
  { eventId: 'upper-2', midiPitch: 65, onsetSeconds: 0.75, offsetSeconds: 1.0 },
], context);

if (draft.status !== 'PASS') throw new Error(`Expected usable PASS draft, got ${draft.status}.`);
if (draft.polyphonicProjection.voiceCount < 2) throw new Error('Runtime fixture must exercise polyphony.');

const opened = await openScoreDraftInEditor(sdk, draft, {
  title: 'S03B Runtime Conformance',
  partName: 'Transcription',
  documentId: 'doc:s03b-runtime',
  revisionId: 'rev:s03b-runtime',
  sha256Hex,
});

if (!opened.ok) {
  throw new Error(`Score Editor open failed: ${opened.code}: ${opened.message}`);
}
if (!opened.revisionGuard) throw new Error('Score Editor did not expose a revision guard after MusicXML import.');
if (opened.revisionGuard.documentId !== 'doc:s03b-runtime') {
  throw new Error(`Unexpected opened document id: ${opened.revisionGuard.documentId}`);
}

const targetResult = sdk.selection.listTargets(opened.revisionGuard);
if (!targetResult.ok) throw new Error(`Semantic target enumeration failed: ${targetResult.error.code}: ${targetResult.error.message}`);
const eventTargets = targetResult.value.filter((target) => target.entityKind === 'event');
if (eventTargets.length < 3) throw new Error(`Expected at least 3 semantic event targets, got ${eventTargets.length}.`);

const exported = exportMusicXmlFromEditor(sdk, opened.revisionGuard);
if (!exported.ok) throw new Error(`Score Editor export failed: ${exported.code}: ${exported.message}`);
if (!exported.musicXml.includes('<score-partwise')) throw new Error('Round-trip export is not MusicXML score-partwise.');
if (!exported.musicXml.includes('<voice>1</voice>')) throw new Error('Round-trip export lost primary voice semantics.');
if (!exported.musicXml.includes('<voice>2</voice>')) throw new Error('Round-trip export lost polyphonic second voice semantics.');

const disposed = sdk.lifecycle.dispose();
if (!disposed.ok) throw new Error(`Score Editor SDK dispose failed: ${disposed.error.code}: ${disposed.error.message}`);

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  sdkVersion: sdk.version,
  sourceDraftVoices: draft.polyphonicProjection.voiceCount,
  semanticEventTargetCount: eventTargets.length,
  importedRevisionId: opened.revisionGuard.revisionId,
  inputMusicXmlBytes: Buffer.byteLength(opened.musicXml),
  exportedMusicXmlBytes: Buffer.byteLength(exported.musicXml),
}, null, 2)}\n`);
