import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildScoreDraft,
  handoffMusicXmlToOptionalGuitarTab,
  serializeScoreDraftToMusicXml,
} from '../src/index.js';

const runtimeEntry = process.argv[2];
if (!runtimeEntry) throw new Error('Guitar TAB application runtime entry path is required.');

const runtimeModule = await import(pathToFileURL(resolve(runtimeEntry)).href);
const runtime = runtimeModule.default ?? runtimeModule;
if (typeof runtime.processMusicXmlUpload !== 'function') {
  throw new Error('Pinned Guitar TAB application runtime does not expose processMusicXmlUpload().');
}

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
if (draft.status !== 'PASS') throw new Error(`Expected PASS source draft, got ${draft.status}.`);
if (draft.polyphonicProjection.voiceCount < 2) throw new Error('S07 runtime fixture must exercise polyphonic routing.');

const sourceMusicXml = serializeScoreDraftToMusicXml(draft, { partName: 'Improvisation' });
const result = handoffMusicXmlToOptionalGuitarTab(runtime, sourceMusicXml);
if (!result.ok) {
  throw new Error(`Optional TAB handoff failed: ${result.code}: ${result.message}; preflight=${JSON.stringify(result.preflight)}`);
}
if (result.source.musicXml !== sourceMusicXml || result.source.preserved !== true) {
  throw new Error('S07 did not preserve the source MusicXML artifact.');
}
if (!result.capabilities || result.capabilities.generateTab !== true) {
  throw new Error('Pinned TAB runtime did not expose generateTab capability.');
}
if (!result.canonicalTabResult || !Array.isArray(result.canonicalTabResult.noteDispositions)) {
  throw new Error('Pinned TAB runtime did not produce canonical v2 note dispositions.');
}
const retained = result.canonicalTabResult.noteDispositions.filter((entry) => entry.disposition === 'KEEP');
if (retained.length === 0 || retained.some((entry) => !entry.selectedPosition)) {
  throw new Error('Pinned TAB runtime did not assign concrete positions to retained notes.');
}
if (typeof result.artifacts.musicXml !== 'string' || !result.artifacts.musicXml.includes('<score-partwise')) {
  throw new Error('TAB MusicXML artifact was not produced.');
}
if (typeof result.artifacts.json !== 'string' || result.artifacts.json.length === 0) {
  throw new Error('TAB JSON evidence artifact was not produced.');
}

const unavailable = handoffMusicXmlToOptionalGuitarTab(null, sourceMusicXml);
if (unavailable.ok || unavailable.source.musicXml !== sourceMusicXml || unavailable.source.preserved !== true) {
  throw new Error('Optional engine absence must preserve the source score.');
}

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  sourceDraftStatus: draft.status,
  sourceVoiceCount: draft.polyphonicProjection.voiceCount,
  tabStatus: result.status,
  runtimeRoute: result.canonicalTabResult?.source?.documentType ?? null,
  preflightStatus: result.preflight?.status ?? null,
  generateTab: result.capabilities.generateTab,
  exportTab: result.capabilities.export,
  provisionalTabAvailable: result.status === 'TAB_REVIEW_REQUIRED',
  sourceMusicXmlBytes: Buffer.byteLength(sourceMusicXml),
  noteDispositionCount: result.canonicalTabResult.noteDispositions.length,
  retainedPositions: retained.map((entry) => ({
    sourceEventId: entry.sourceEventId,
    string: entry.selectedPosition.string,
    fret: entry.selectedPosition.fret,
  })),
  tabMusicXmlBytes: Buffer.byteLength(result.artifacts.musicXml),
  sourcePreservedWhenEngineMissing: unavailable.source.preserved,
}, null, 2)}\n`);
