import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  applyScoreEditorTeacherEdit,
  buildScoreDraft,
  createTeacherCorrectionLedger,
  exportMusicXmlFromEditor,
  openScoreDraftWithSourceIdentityInEditor,
  rational,
  resolveScoreEditorSourceIdentity,
} from '../src/index.js';

const sdkEntry = process.argv[2];
if (!sdkEntry) throw new Error('Score Editor public SDK entry path is required.');

const sdkModule = await import(pathToFileURL(resolve(sdkEntry)).href);
if (typeof sdkModule.createScoreEditorSdkV1WithSourceIdentity !== 'function') {
  throw new Error('Pinned Score Editor public entry does not export createScoreEditorSdkV1WithSourceIdentity().');
}

const sdk = sdkModule.createScoreEditorSdkV1WithSourceIdentity();
if (sdk.version !== '1.0.0') throw new Error(`Unexpected Score Editor SDK version: ${sdk.version}`);
if (sdk.supports('document') !== true) throw new Error('Pinned Score Editor SDK lacks document capability.');
if (sdk.supports('authoring') !== true) throw new Error('Pinned Score Editor SDK lacks authoring capability.');
if (!sdk.sourceIdentity || typeof sdk.sourceIdentity.listNoteMappings !== 'function') {
  throw new Error('Pinned Score Editor SDK lacks the public sourceIdentity surface.');
}

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
if (draft.polyphonicProjection.voiceCount < 2) throw new Error('Runtime fixture must exercise source polyphony.');

const opened = await openScoreDraftWithSourceIdentityInEditor(sdk, draft, {
  title: 'S06E Runtime Conformance',
  partName: 'Transcription',
  documentId: 'doc:s06e-runtime',
  revisionId: 'rev:s06e-runtime',
  sha256Hex,
});

if (!opened.ok) throw new Error(`Score Editor open failed: ${opened.code}: ${opened.message}`);
if (!opened.revisionGuard) throw new Error('Score Editor did not expose a revision guard after MusicXML import.');
if (!opened.sourceIdentity?.ok) throw new Error(`Source identity resolution failed: ${opened.sourceIdentity?.code ?? 'UNKNOWN'}`);
if (opened.sourceIdentity.unresolvedSourceNoteIds.length !== 0) {
  throw new Error(`Source identity left unresolved notes: ${opened.sourceIdentity.unresolvedSourceNoteIds.join(', ')}`);
}

const bassMapping = opened.sourceIdentity.mappings.find((item) => item.sourceEventId === 'bass');
if (!bassMapping) throw new Error('Source identity manifest did not resolve the bass source event.');

const selected = sdk.selection.select(bassMapping.target.address, opened.revisionGuard);
if (!selected.ok) throw new Error(`Semantic note selection failed: ${selected.error.code}: ${selected.error.message}`);
const editResult = sdk.authoring.commitKeypad({
  expected: opened.revisionGuard,
  action: Object.freeze({ version: '1.0.0', actionId: 'duration.quarter' }),
  nextRevisionId: 'rev:s06e-sdk-edit',
});
if (!editResult.ok) throw new Error(`Public SDK authoring failed: ${editResult.error.code}: ${editResult.error.message}`);
const editedGuard = sdk.getRevisionGuard();
if (!editedGuard || editedGuard.revisionId !== 'rev:s06e-sdk-edit') {
  throw new Error('Public SDK authoring did not produce the requested revision.');
}

const staleIdentity = resolveScoreEditorSourceIdentity(sdk, opened.sourceIdentityManifest, opened.revisionGuard);
if (staleIdentity.ok || staleIdentity.code !== 'STALE_REQUEST') {
  throw new Error('Source identity revision guard did not fail closed for the stale pre-edit revision.');
}
const editedIdentity = resolveScoreEditorSourceIdentity(sdk, opened.sourceIdentityManifest, editedGuard);
if (!editedIdentity.ok) throw new Error(`Edited source identity resolution failed: ${editedIdentity.code}: ${editedIdentity.message}`);
const editedBassMapping = editedIdentity.mappings.find((item) => item.sourceNoteId === bassMapping.sourceNoteId);
if (!editedBassMapping || editedBassMapping.sourceEventId !== bassMapping.sourceEventId) {
  throw new Error('The same sourceNoteId did not resolve to the stable sourceEventId after the edit revision.');
}

const teacherLedger = createTeacherCorrectionLedger({ ledgerId: 'runtime:teacher-ledger' });
const teacherEdit = applyScoreEditorTeacherEdit(draft, teacherLedger, {
  sdkVersion: sdk.version,
  actionId: 'duration.quarter',
  sourceEventId: editedBassMapping.sourceEventId,
  editorTargetId: JSON.stringify(editedBassMapping.target.address),
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

const reopened = await openScoreDraftWithSourceIdentityInEditor(sdk, teacherEdit.correctedDraft, {
  title: 'S06E Teacher Overlay',
  partName: 'Transcription',
  documentId: 'doc:s06e-overlay',
  revisionId: 'rev:s06e-overlay',
  sha256Hex,
});
if (!reopened.ok || !reopened.revisionGuard || !reopened.sourceIdentity?.ok) {
  throw new Error(`Corrected ScoreDraft failed source-identity SDK re-open: ${reopened.code ?? reopened.sourceIdentity?.code ?? 'NO_GUARD'}`);
}

const exported = exportMusicXmlFromEditor(sdk, reopened.revisionGuard);
if (!exported.ok) throw new Error(`Score Editor export failed: ${exported.code}: ${exported.message}`);
if (!exported.musicXml.includes('<score-partwise')) throw new Error('Round-trip export is not MusicXML score-partwise.');
if (!exported.musicXml.includes('<voice>1</voice>')) throw new Error('Round-trip export lost usable voice semantics.');

const disposed = sdk.lifecycle.dispose();
if (!disposed.ok) throw new Error(`Score Editor SDK dispose failed: ${disposed.error.code}: ${disposed.error.message}`);

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  sdkVersion: sdk.version,
  sourceDraftVoices: draft.polyphonicProjection.voiceCount,
  correctedDraftVoices: teacherEdit.correctedDraft.polyphonicProjection.voiceCount,
  sourceIdentityMappingCount: opened.sourceIdentity.mappings.length,
  stableSourceNoteId: bassMapping.sourceNoteId,
  stableSourceEventId: editedBassMapping.sourceEventId,
  sdkEditedRevisionId: editedGuard.revisionId,
  staleRevisionGuardRejected: true,
  overlayRevision: teacherEdit.ledger.revision,
  overlayAppliedCorrectionCount: teacherEdit.overlay.appliedCorrections.length,
  correctedBassDurationQuarter: correctedBass.durationQuarter,
  correctedInputMusicXmlBytes: Buffer.byteLength(reopened.musicXml),
  correctedExportedMusicXmlBytes: Buffer.byteLength(exported.musicXml),
}, null, 2)}\n`);
