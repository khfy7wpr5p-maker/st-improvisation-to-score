import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runAudioToScorePipeline } from '../src/index.js';

const [providerEntry, sdkEntry, tabRuntimeEntry, audioPath] = process.argv.slice(2);
if (!providerEntry || !sdkEntry || !tabRuntimeEntry || !audioPath) {
  throw new Error('Expected provider entry, Score Editor SDK entry, Guitar TAB runtime entry and audio path.');
}

const providerModule = await import(pathToFileURL(resolve(providerEntry)).href);
const sdkModule = await import(pathToFileURL(resolve(sdkEntry)).href);
const tabModule = await import(pathToFileURL(resolve(tabRuntimeEntry)).href);
const tabRuntime = tabModule.default ?? tabModule;

if (typeof providerModule.deriveMidiReferenceFromAudio !== 'function') {
  throw new Error('Pinned Basic Pitch provider does not expose deriveMidiReferenceFromAudio().');
}
if (typeof sdkModule.createScoreEditorSdkV1WithSourceIdentity !== 'function') {
  throw new Error('Pinned Score Editor SDK does not expose source-identity SDK factory.');
}
if (typeof tabRuntime.processMusicXmlUpload !== 'function') {
  throw new Error('Pinned Guitar TAB runtime does not expose processMusicXmlUpload().');
}

const sdk = sdkModule.createScoreEditorSdkV1WithSourceIdentity();
const audio = readFileSync(resolve(audioPath));
const audioSha256 = createHash('sha256').update(audio).digest('hex');
const sha256Hex = async (text) => createHash('sha256').update(new TextEncoder().encode(text)).digest('hex');

const result = await runAudioToScorePipeline({
  audioInput: audio,
  sourceId: 's09:rights-clean-real-mp3',
  fileName: 's09-rights-clean.mp3',
  context: {
    bpm: 60,
    meterNumerator: 4,
    meterDenominator: 4,
    smallestNoteDenominator: 16,
    allowTriplets: false,
  },
  transcriptionProvider: providerModule.deriveMidiReferenceFromAudio,
  transcriptionProviderOptions: {
    providerConfig: {
      onset_threshold: 0.3,
      frame_threshold: 0.2,
      minimum_note_length: 60,
    },
  },
  scoreEditorSdk: sdk,
  scoreEditorOptions: {
    title: 'S09 Real MP3 E2E',
    partName: 'Transcription',
    documentId: 'doc:s09-real-mp3',
    revisionId: 'rev:s09-real-mp3',
    sha256Hex,
  },
  guitarTabEngine: tabRuntime,
});

if (!result.ok) throw new Error(`S09 pipeline failed: ${result.code}: ${result.message}`);
if (result.providerResult.audioSha256 !== audioSha256) throw new Error('Real MP3 audio identity was not preserved.');
if (result.providerResult.noteEvents.length < 1) throw new Error('Real Basic Pitch inference returned no note events.');
if (!result.score?.draft || result.score.draft.quantizedEvents.length < 1) throw new Error('Basic Pitch evidence did not reach ScoreDraft.');
if (typeof result.musicXml !== 'string' || !result.musicXml.includes('<score-partwise')) throw new Error('ScoreDraft did not produce MusicXML.');
if (!result.editor?.ok || !result.editor.revisionGuard) throw new Error(`Real Score Editor open failed: ${result.editor?.code ?? 'NO_RESULT'}`);
if (!result.editor.sourceIdentity?.ok) throw new Error(`Score Editor source identity failed: ${result.editor.sourceIdentity?.code ?? 'UNKNOWN'}`);
if (result.editor.sourceIdentity.unresolvedSourceNoteIds.length !== 0) {
  throw new Error(`Score Editor left unresolved source notes: ${result.editor.sourceIdentity.unresolvedSourceNoteIds.join(', ')}`);
}
if (!result.guitarTab) throw new Error('Optional Guitar TAB stage did not run.');
if (result.guitarTab.source.musicXml !== result.musicXml || result.guitarTab.source.preserved !== true) {
  throw new Error('Guitar TAB stage did not preserve the source MusicXML.');
}
if (!result.guitarTab.ok) {
  throw new Error(`Pinned Guitar TAB runtime rejected the rights-clean real-audio score: ${result.guitarTab.code}: ${result.guitarTab.message}`);
}
if (result.guitarTab.capabilities?.generateTab !== true) throw new Error('Guitar TAB runtime did not expose generateTab capability.');

const disposed = sdk.lifecycle.dispose();
if (!disposed.ok) throw new Error(`Score Editor SDK dispose failed: ${disposed.error.code}`);

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  pipelineStatus: result.status,
  audioSha256,
  audioBytes: audio.byteLength,
  basicPitchPackageVersion: result.providerResult.provider.packageVersion,
  basicPitchNoteEventCount: result.providerResult.noteEvents.length,
  quantizedEventCount: result.score.draft.quantizedEvents.length,
  voiceCount: result.score.draft.polyphonicProjection.voiceCount,
  musicXmlBytes: Buffer.byteLength(result.musicXml),
  scoreEditorOpened: result.editor.ok,
  sourceIdentityMappings: result.editor.sourceIdentity.mappings.length,
  guitarTabStatus: result.guitarTab.status,
  guitarTabGenerateCapability: result.guitarTab.capabilities.generateTab,
  guitarTabExportCapability: result.guitarTab.capabilities.export,
  sourceMusicXmlPreservedThroughTab: result.guitarTab.source.preserved,
}, null, 2)}\n`);
