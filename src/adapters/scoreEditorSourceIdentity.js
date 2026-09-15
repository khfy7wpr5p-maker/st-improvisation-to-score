import { ImprovisationToScoreError } from '../contracts.js';
import {
  createScoreDraftMusicXmlManifest,
  serializeScoreDraftToMusicXml,
} from '../export/musicXml.js';
import { SCORE_EDITOR_SDK_REQUIRED_VERSION } from './scoreEditorSdk.js';

export const SCORE_EDITOR_SOURCE_IDENTITY_BRIDGE_VERSION = '0.1.0';
export const SCORE_EDITOR_SOURCE_NOTE_PREFIX = 'sti_n';

function compareRational(a, b) {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function orderedPitchedSegments(draft) {
  const voices = [...(draft?.polyphonicProjection?.voices ?? [])]
    .sort((a, b) => a.voiceId.localeCompare(b.voiceId, undefined, { numeric: true }));
  const topology = draft?.measureTopology?.measures ?? [];
  const result = [];

  for (let measureIndex = 0; measureIndex < topology.length; measureIndex += 1) {
    for (const voice of voices) {
      const measure = voice.measures.find((item) => item.measureIndex === measureIndex);
      if (!measure) continue;
      const groups = new Map();
      for (const note of measure.notes) {
        const key = `${note.onsetInMeasure.numerator}/${note.onsetInMeasure.denominator}`;
        const list = groups.get(key) ?? [];
        list.push(note);
        groups.set(key, list);
      }
      const orderedGroups = [...groups.values()]
        .map((notes) => {
          notes.sort((a, b) => compareRational(b.durationQuarter, a.durationQuarter)
            || a.midiPitch - b.midiPitch
            || a.segmentId.localeCompare(b.segmentId));
          return notes;
        })
        .sort((a, b) => compareRational(a[0].onsetInMeasure, b[0].onsetInMeasure));
      for (const notes of orderedGroups) result.push(...notes);
    }
  }
  return result;
}

function addSourceIdsToGeneratedMusicXml(musicXml, sourceNotes) {
  let pitchedIndex = 0;
  const decorated = musicXml.replace(/<note>([\s\S]*?)<\/note>/g, (block) => {
    if (!block.includes('<pitch>')) return block;
    const source = sourceNotes[pitchedIndex];
    if (!source) fail('SCORE_EDITOR_SOURCE_IDENTITY_SERIALIZATION_MISMATCH', 'Generated MusicXML contains more pitched notes than the source identity manifest.');
    pitchedIndex += 1;
    return block.replace('<note>', `<note id="${source.sourceNoteId}">`);
  });
  if (pitchedIndex !== sourceNotes.length) {
    fail('SCORE_EDITOR_SOURCE_IDENTITY_SERIALIZATION_MISMATCH', 'Source identity manifest contains more pitched segments than generated MusicXML.', {
      manifestCount: sourceNotes.length,
      serializedCount: pitchedIndex,
    });
  }
  return decorated;
}

export function createScoreEditorSourceIdentityManifest(draft) {
  const segments = orderedPitchedSegments(draft);
  return Object.freeze({
    schemaVersion: 'score-editor-source-identity-manifest-v0.1',
    bridgeVersion: SCORE_EDITOR_SOURCE_IDENTITY_BRIDGE_VERSION,
    sourceNotes: Object.freeze(segments.map((segment, index) => Object.freeze({
      sourceNoteId: `${SCORE_EDITOR_SOURCE_NOTE_PREFIX}${index + 1}`,
      sourceEventId: segment.sourceEventId,
      segmentId: segment.segmentId,
      voiceId: segment.voiceId,
      measureIndex: segment.measureIndex,
      tieFromPrevious: segment.tieFromPrevious,
      tieToNext: segment.tieToNext,
    }))),
  });
}

export function serializeScoreDraftForScoreEditor(draft, options = {}) {
  const sourceIdentityManifest = createScoreEditorSourceIdentityManifest(draft);
  const baseManifest = createScoreDraftMusicXmlManifest(draft);
  const baseMusicXml = serializeScoreDraftToMusicXml(draft, options);
  const musicXml = addSourceIdsToGeneratedMusicXml(baseMusicXml, sourceIdentityManifest.sourceNotes);
  return Object.freeze({ musicXml, manifest: baseManifest, sourceIdentityManifest });
}

function identityFailure(code, message, details = {}) {
  return Object.freeze({ ok: false, code, message, details: Object.freeze({ ...details }) });
}

export function resolveScoreEditorSourceIdentity(sdk, sourceIdentityManifest, expectedRevisionGuard) {
  if (!sdk?.sourceIdentity || typeof sdk.sourceIdentity.listNoteMappings !== 'function') {
    return identityFailure('SCORE_EDITOR_SOURCE_IDENTITY_UNAVAILABLE', 'Score Editor public sourceIdentity surface is unavailable.');
  }
  let result;
  try {
    result = sdk.sourceIdentity.listNoteMappings(expectedRevisionGuard);
  } catch (error) {
    return identityFailure('SCORE_EDITOR_SOURCE_IDENTITY_FAILED', error instanceof Error ? error.message : String(error));
  }
  if (!result?.ok) {
    return identityFailure(
      result?.error?.code ?? 'SCORE_EDITOR_SOURCE_IDENTITY_FAILED',
      result?.error?.message ?? 'Score Editor source identity resolution failed.',
      { sdkError: result?.error ?? null },
    );
  }

  const bySourceNoteId = new Map(sourceIdentityManifest.sourceNotes.map((item) => [item.sourceNoteId, item]));
  const seen = new Set();
  const mappings = [];
  for (const mapping of result.value ?? []) {
    const source = bySourceNoteId.get(mapping.sourceNoteId);
    if (!source || seen.has(mapping.sourceNoteId)) continue;
    seen.add(mapping.sourceNoteId);
    mappings.push(Object.freeze({
      sourceNoteId: mapping.sourceNoteId,
      sourceEventId: source.sourceEventId,
      segmentId: source.segmentId,
      target: mapping.target,
    }));
  }
  const unresolvedSourceNoteIds = sourceIdentityManifest.sourceNotes
    .map((item) => item.sourceNoteId)
    .filter((sourceNoteId) => !seen.has(sourceNoteId));
  return Object.freeze({
    ok: true,
    mappings: Object.freeze(mappings),
    unresolvedSourceNoteIds: Object.freeze(unresolvedSourceNoteIds),
  });
}

export async function openScoreDraftWithSourceIdentityInEditor(sdk, draft, options = {}) {
  let artifact;
  try {
    artifact = serializeScoreDraftForScoreEditor(draft, options.musicXml ?? options);
  } catch (error) {
    return identityFailure(error instanceof ImprovisationToScoreError ? error.code : 'MUSICXML_SERIALIZATION_FAILED', error instanceof Error ? error.message : String(error));
  }
  const preserved = {
    musicXml: artifact.musicXml,
    manifest: artifact.manifest,
    sourceIdentityManifest: artifact.sourceIdentityManifest,
  };
  if (!sdk || typeof sdk !== 'object' || sdk.version !== SCORE_EDITOR_SDK_REQUIRED_VERSION) {
    return Object.freeze({ ...identityFailure('SCORE_EDITOR_SDK_UNAVAILABLE', 'Compatible Score Editor SDK is required.'), ...preserved });
  }
  if (!sdk.document || typeof sdk.document.openMusicXml !== 'function') {
    return Object.freeze({ ...identityFailure('SCORE_EDITOR_OPEN_MUSICXML_UNAVAILABLE', 'Score Editor public document.openMusicXml operation is unavailable.'), ...preserved });
  }

  let opened;
  try {
    opened = await sdk.document.openMusicXml(artifact.musicXml, {
      ...(options.title ? { title: options.title } : {}),
      ...(options.documentId ? { documentId: options.documentId } : {}),
      ...(options.revisionId ? { revisionId: options.revisionId } : {}),
      ...(typeof options.sha256Hex === 'function' ? { sha256Hex: options.sha256Hex } : {}),
    });
  } catch (error) {
    return Object.freeze({ ...identityFailure('SCORE_EDITOR_OPEN_MUSICXML_FAILED', error instanceof Error ? error.message : String(error)), ...preserved });
  }
  if (!opened?.ok) {
    return Object.freeze({ ...identityFailure(opened?.error?.code ?? 'SCORE_EDITOR_OPEN_MUSICXML_FAILED', opened?.error?.message ?? 'Score Editor rejected generated MusicXML.', { sdkError: opened?.error ?? null }), ...preserved });
  }

  const revisionGuard = typeof sdk.getRevisionGuard === 'function' ? sdk.getRevisionGuard() : null;
  const sourceIdentity = revisionGuard
    ? resolveScoreEditorSourceIdentity(sdk, artifact.sourceIdentityManifest, revisionGuard)
    : identityFailure('SCORE_EDITOR_REVISION_GUARD_UNAVAILABLE', 'Score Editor did not expose a revision guard.');

  return Object.freeze({
    ok: true,
    status: 'EDITOR_OPENED',
    sdkVersion: sdk.version,
    ...preserved,
    snapshot: opened.value ?? null,
    revisionGuard,
    sourceIdentity,
  });
}
