import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildScoreDraft,
  handoffMusicXmlToOptionalGuitarTab,
  serializeScoreDraftToMusicXml,
} from '../src/index.js';

const engineEntry = process.argv[2];
if (!engineEntry) throw new Error('Guitar TAB engine entry path is required.');

const engineModule = await import(pathToFileURL(resolve(engineEntry)).href);
const engine = engineModule.default ?? engineModule;
if (typeof engine.convertMusicXmlToCanonicalTab !== 'function') {
  throw new Error('Pinned Guitar TAB engine does not expose convertMusicXmlToCanonicalTab().');
}

const context = {
  bpm: 120,
  meterNumerator: 4,
  meterDenominator: 4,
  smallestNoteDenominator: 16,
  allowTriplets: false,
};

const draft = buildScoreDraft([
  { eventId: 'g1', midiPitch: 64, onsetSeconds: 0, offsetSeconds: 0.5 },
  { eventId: 'g2', midiPitch: 67, onsetSeconds: 0.5, offsetSeconds: 1.0 },
  { eventId: 'g3', midiPitch: 71, onsetSeconds: 1.0, offsetSeconds: 1.5 },
], context);
if (draft.status !== 'PASS') throw new Error(`Expected PASS source draft, got ${draft.status}.`);

const sourceMusicXml = serializeScoreDraftToMusicXml(draft, { partName: 'Improvisation' });
const result = handoffMusicXmlToOptionalGuitarTab(engine, sourceMusicXml);
if (!result.ok) throw new Error(`Optional TAB handoff failed: ${result.code}: ${result.message}`);
if (result.source.musicXml !== sourceMusicXml || result.source.preserved !== true) {
  throw new Error('S07 did not preserve the source MusicXML artifact.');
}
if (!result.canonicalTabResult || result.canonicalTabResult.noteCount !== 3) {
  throw new Error(`Expected 3 TAB notes, got ${result.canonicalTabResult?.noteCount ?? 'none'}.`);
}
const noteEvents = result.canonicalTabResult.measures.flatMap((measure) => measure.events).filter((event) => event.type !== 'rest');
if (noteEvents.some((event) => !event.selectedPosition || !Number.isInteger(event.selectedPosition.string) || !Number.isInteger(event.selectedPosition.fret))) {
  throw new Error('Pinned TAB engine did not assign concrete string/fret positions.');
}
if (typeof result.artifacts.ascii !== 'string' || result.artifacts.ascii.length === 0) {
  throw new Error('ASCII TAB artifact was not produced.');
}
if (typeof result.artifacts.musicXml !== 'string' || !result.artifacts.musicXml.includes('<score-partwise')) {
  throw new Error('TAB MusicXML artifact was not produced.');
}

const unavailable = handoffMusicXmlToOptionalGuitarTab(null, sourceMusicXml);
if (unavailable.ok || unavailable.source.musicXml !== sourceMusicXml || unavailable.source.preserved !== true) {
  throw new Error('Optional engine absence must preserve the source score.');
}

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  sourceDraftStatus: draft.status,
  tabStatus: result.status,
  preflightStatus: result.preflight?.status ?? null,
  sourceMusicXmlBytes: Buffer.byteLength(sourceMusicXml),
  tabNoteCount: result.canonicalTabResult.noteCount,
  assignedPositions: noteEvents.map((event) => ({
    string: event.selectedPosition.string,
    fret: event.selectedPosition.fret,
  })),
  asciiBytes: Buffer.byteLength(result.artifacts.ascii),
  tabMusicXmlBytes: Buffer.byteLength(result.artifacts.musicXml),
  sourcePreservedWhenEngineMissing: unavailable.source.preserved,
}, null, 2)}\n`);
