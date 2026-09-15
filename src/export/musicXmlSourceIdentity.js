import {
  createScoreDraftMusicXmlManifest,
  serializeScoreDraftToMusicXml,
} from './musicXml.js';

export const SCORE_DRAFT_SOURCE_NOTE_IDENTITY_VERSION = '0.1.0';

function compare(a, b) {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  return left < right ? -1 : left > right ? 1 : 0;
}

function rationalKey(value) {
  return `${value.numerator}/${value.denominator}`;
}

function orderedProjectedSegments(draft) {
  const voices = [...(draft?.polyphonicProjection?.voices ?? [])]
    .sort((a, b) => a.voiceId.localeCompare(b.voiceId, undefined, { numeric: true }));
  const topologyCount = draft?.measureTopology?.measures?.length ?? 0;
  const projectedCount = voices.length === 0 ? 0 : Math.max(...voices.map((voice) => voice.lastMeasureIndex + 1));
  const measureCount = Math.max(topologyCount, projectedCount);
  const out = [];

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    for (const voice of voices) {
      const measure = voice.measures.find((item) => item.measureIndex === measureIndex);
      if (!measure) continue;
      const groups = new Map();
      for (const note of measure.notes) {
        const key = rationalKey(note.onsetInMeasure);
        const list = groups.get(key) ?? [];
        list.push(note);
        groups.set(key, list);
      }
      const orderedGroups = [...groups.values()].sort((left, right) => compare(left[0].onsetInMeasure, right[0].onsetInMeasure));
      for (const notes of orderedGroups) {
        notes.sort((a, b) => compare(b.durationQuarter, a.durationQuarter) || a.midiPitch - b.midiPitch || a.segmentId.localeCompare(b.segmentId));
        out.push(...notes);
      }
    }
  }
  return out;
}

export function createScoreDraftSourceNoteIdentity(draft) {
  const segments = orderedProjectedSegments(draft);
  return Object.freeze(segments.map((segment, index) => Object.freeze({
    sourceNoteId: `sti_n${index + 1}`,
    sourceEventId: segment.sourceEventId,
    segmentId: segment.segmentId,
    voiceId: segment.voiceId,
    measureIndex: segment.measureIndex,
    midiPitch: segment.midiPitch,
    onsetInMeasure: segment.onsetInMeasure,
    durationQuarter: segment.durationQuarter,
    tieFromPrevious: segment.tieFromPrevious,
    tieToNext: segment.tieToNext,
  })));
}

function decoratePitchedNotes(musicXml, sourceNotes) {
  let pitchedIndex = 0;
  let overflow = false;
  const decorated = musicXml.replace(/<note>([\s\S]*?)<\/note>/g, (full, body) => {
    if (!body.includes('<pitch>')) return full;
    const evidence = sourceNotes[pitchedIndex];
    pitchedIndex += 1;
    if (!evidence) {
      overflow = true;
      return full;
    }
    return `<note id="${evidence.sourceNoteId}">${body}</note>`;
  });
  const exact = !overflow && pitchedIndex === sourceNotes.length;
  return Object.freeze({ exact, pitchedNoteCount: pitchedIndex, musicXml: exact ? decorated : musicXml });
}

export function createScoreDraftEditorMusicXmlPayload(draft, options = {}) {
  const baseMusicXml = serializeScoreDraftToMusicXml(draft, options);
  const baseManifest = createScoreDraftMusicXmlManifest(draft);
  const sourceNotes = createScoreDraftSourceNoteIdentity(draft);
  const decorated = decoratePitchedNotes(baseMusicXml, sourceNotes);
  const applicable = sourceNotes.length > 0;
  const applied = applicable && decorated.exact;
  const status = !applicable ? 'NOT_APPLICABLE' : applied ? 'APPLIED' : 'DEGRADED';
  const manifest = Object.freeze({
    ...baseManifest,
    schemaVersion: 'score-draft-musicxml-manifest-v0.3',
    sourceNoteIdentityVersion: SCORE_DRAFT_SOURCE_NOTE_IDENTITY_VERSION,
    sourceNotes: applied ? sourceNotes : Object.freeze([]),
  });
  return Object.freeze({
    schemaVersion: 'score-draft-editor-musicxml-payload-v0.1',
    sourceNoteIdentityVersion: SCORE_DRAFT_SOURCE_NOTE_IDENTITY_VERSION,
    musicXml: decorated.musicXml,
    manifest,
    sourceIdentity: Object.freeze({
      status,
      applied,
      expectedSourceNoteCount: sourceNotes.length,
      observedPitchedNoteCount: decorated.pitchedNoteCount,
      nonBlocking: true,
    }),
  });
}
