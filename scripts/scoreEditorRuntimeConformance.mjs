import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  applyScoreEditorTeacherEdit,
  buildScoreDraft,
  createTeacherCorrectionLedger,
  exportMusicXmlFromEditor,
  openScoreDraftInEditor,
  rational,
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
if (sdk.supports('authoring') !== true) throw new Error('Pinned Score Editor SDK lacks authoring capability.');

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
  title: 'S06D Runtime Conformance',
  partName: 'Transcription',
  documentId: 'doc:s06d-runtime',
  revisionId: 'rev:s06d-runtime',
  sha256Hex,
});

if (!opened.ok) throw new Error(`Score Editor open failed: ${opened.code}: ${opened.message}`);
if (!opened.revisionGuard) throw new Error('Score Editor did not expose a revision guard after MusicXML import.');

const targetResult = sdk.selection.listTargets(opened.revisionGuard);
if (!targetResult.ok) throw new Error(`Semantic target enumeration failed: ${targetResult.error.code}: ${targetResult.error.message}`);
const eventTargets = targetResult.value.filter((target) => target.entityKind === 'event');
if (eventTargets.length < 3) throw new Error(`Expected at least 3 semantic event targets, got ${eventTargets.length}.`);

const selected = sdk.selection.select(eventTargets[0].address, opened.revisionGuard);
if (!selected.ok) throw new Error(`Semantic event selection failed: ${selected.error.code}: ${selected.error.message}`);
const editResult = sdk.authoring.commitKeypad({
  expected: opened.revisionGuard,
  action: Object.freeze({ version: '1.0.0', actionId: 'duration.quarter' }),
  nextRevisionId: 'rev:s06d-sdk-edit',
});
if (!editResult.ok) throw new Error(`Public SDK authoring failed: ${editResult.error.code}: ${editResult.error.message}`);
const editedGuard = sdk.getRevisionGuard();
if (!editedGuard || editedGuard.revisionId !== 'rev:s06d-sdk-edit') {
  throw new Error('Public SDK authoring did not produce the requested revision.');
}

const teacherLedger = createTeacherCorrectionLedger({ ledgerId: 'runtime:teacher-ledger' });
const teacherEdit = applyScoreEditorTeacherEdit(draft, teacherLedger, {
  sdkVersion: sdk.version,
  actionId: 'duration.quarter',
  sourceEventId: 'bass',
  editorTargetId: JSON.stringify(eventTargets[0].address),
  documentId: editedGuard.documentId,
  revisionBefore: opened.revisionGuard.revisionId,
  revisionAfter: editedGuard.revisionId,
  before: rational(4, 1),
  after: rational(1, 1),
  actorId: 'runtime-teacher',
  correctionId: 'runtime-duration-correction',
});

const correctedBass = teacherEdit.correctedDraft.quantizedEvents.find((event) => event.eventId === 'bass');
if (!correctedBass || correctedBass.durationQuarter.numerator !== 1 || correctedBass.durationQuarter.denominator !== 1) {
  throw new Error('Teacher edit receipt did not rebuild the source event to quarter-note duration.');
}
if (draft.quantizedEvents.find((event) => event.eventId === 'bass')?.durationQuarter.numerator !== 4) {
  throw new Error('Teacher overlay mutated the original machine draft.');
}

const reopened = await openScoreDraftInEditor(sdk, teacherEdit.correctedDraft, {
  title: 'S06D Teacher Overlay',
  partName: 'Transcription',
  documentId: 'doc:s06d-overlay',
  revisionId: 'rev:s06d-overlay',
  sha256Hex,
});
if (!reopened.ok || !reopened.revisionGuard) {
  throw new Error(`Corrected ScoreDraft failed public SDK re-open: ${reopened.code ?? 'NO_GUARD'}: ${reopened.message ?? 'missing revision guard'}`);
}

const exported = exportMusicXmlFromEditor(sdk, reopened.revisionGuard);
if (!exported.ok) throw new Error(`Score Editor export failed: ${exported.code}: ${exported.message}`);
if (!exported.musicXml.includes('<score-partwise')) throw new Error('Round-trip export is not MusicXML score-partwise.');
if (!exported.musicXml.includes('<voice>1</voice>')) throw new Error('Round-trip export lost primary voice semantics.');
if (!exported.musicXml.includes('<voice>2</voice>')) throw new Error('Round-trip export lost polyphonic second voice semantics.');

const disposed = sdk.lifecycle.dispose();
if (!disposed.ok) throw new Error(`Score Editor SDK dispose failed: ${disposed.error.code}: ${disposed.error.message}`);

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  sdkVersion: sdk.version,
  teacherWorkflowCapability: sdk.supports('teacherWorkflow'),
  sourceDraftVoices: draft.polyphonicProjection.voiceCount,
  semanticEventTargetCount: eventTargets.length,
  sdkEditedRevisionId: editedGuard.revisionId,
  overlayRevision: teacherEdit.ledger.revision,
  overlayAppliedCorrectionCount: teacherEdit.overlay.appliedCorrections.length,
  correctedBassDurationQuarter: correctedBass.durationQuarter,
  correctedInputMusicXmlBytes: Buffer.byteLength(reopened.musicXml),
  correctedExportedMusicXmlBytes: Buffer.byteLength(exported.musicXml),
}, null, 2)}\n`);
