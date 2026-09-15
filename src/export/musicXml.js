import { ImprovisationToScoreError, rational } from '../contracts.js';

export const SCORE_DRAFT_MUSICXML_VERSION = '0.2.0';
export const SCORE_DRAFT_MUSICXML_MAX_DIVISIONS = 16_384;

function fail(code, message, details = {}) {
  throw new ImprovisationToScoreError(code, message, details);
}

function absBig(value) {
  return value < 0n ? -value : value;
}

function gcdBig(a, b) {
  let x = absBig(a);
  let y = absBig(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x || 1n;
}

function lcmBig(a, b) {
  if (a === 0n || b === 0n) return 0n;
  return absBig((a / gcdBig(a, b)) * b);
}

function compare(a, b) {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  return left < right ? -1 : left > right ? 1 : 0;
}

function escapeText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function rationalKey(value) {
  return `${value.numerator}/${value.denominator}`;
}

function chooseDivisions(draft) {
  let divisions = 1n;
  const include = (value) => {
    if (!value || !Number.isSafeInteger(value.denominator) || value.denominator <= 0) {
      fail('INVALID_MUSICXML_RATIONAL', 'Projection contains an invalid rational value.');
    }
    divisions = lcmBig(divisions, BigInt(value.denominator));
    if (divisions > BigInt(SCORE_DRAFT_MUSICXML_MAX_DIVISIONS)) {
      fail('MUSICXML_DIVISIONS_LIMIT_EXCEEDED', 'Required MusicXML divisions exceed the serialization safety envelope.', {
        limit: SCORE_DRAFT_MUSICXML_MAX_DIVISIONS,
        observed: divisions.toString(),
      });
    }
  };

  include(draft.measureLengthQuarter);
  for (const voice of draft.polyphonicProjection?.voices ?? []) {
    for (const measure of voice.measures) {
      for (const note of measure.notes) {
        include(note.onsetInMeasure);
        include(note.durationQuarter);
      }
      for (const rest of measure.rests) {
        include(rest.onsetInMeasure);
        include(rest.durationQuarter);
      }
    }
  }
  return Number(divisions);
}

function xmlUnits(value, divisions, field) {
  const numerator = BigInt(value.numerator) * BigInt(divisions);
  const denominator = BigInt(value.denominator);
  if (denominator <= 0n || numerator % denominator !== 0n) {
    fail('UNREPRESENTABLE_MUSICXML_RATIONAL', 'Rational value cannot be represented by selected MusicXML divisions.', {
      field,
      value,
      divisions,
    });
  }
  const units = numerator / denominator;
  if (units < 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('MUSICXML_UNIT_OUT_OF_RANGE', 'MusicXML units exceed safe range.', { field });
  }
  return Number(units);
}

const PITCH_CLASSES = Object.freeze([
  Object.freeze({ step: 'C', alter: 0 }),
  Object.freeze({ step: 'C', alter: 1 }),
  Object.freeze({ step: 'D', alter: 0 }),
  Object.freeze({ step: 'D', alter: 1 }),
  Object.freeze({ step: 'E', alter: 0 }),
  Object.freeze({ step: 'F', alter: 0 }),
  Object.freeze({ step: 'F', alter: 1 }),
  Object.freeze({ step: 'G', alter: 0 }),
  Object.freeze({ step: 'G', alter: 1 }),
  Object.freeze({ step: 'A', alter: 0 }),
  Object.freeze({ step: 'A', alter: 1 }),
  Object.freeze({ step: 'B', alter: 0 }),
]);

function midiPitch(midi) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) fail('INVALID_MIDI_PITCH', 'MIDI pitch must be 0..127.', { midi });
  const pitchClass = PITCH_CLASSES[midi % 12];
  return Object.freeze({ ...pitchClass, octave: Math.floor(midi / 12) - 1 });
}

function pitchLines(midi, indent) {
  const pitch = midiPitch(midi);
  const lines = [`${indent}<pitch>`, `${indent}  <step>${pitch.step}</step>`];
  if (pitch.alter !== 0) lines.push(`${indent}  <alter>${pitch.alter}</alter>`);
  lines.push(`${indent}  <octave>${pitch.octave}</octave>`, `${indent}</pitch>`);
  return lines;
}

function tieLines(segment, indent) {
  const direct = [];
  const notation = [];
  if (segment.tieFromPrevious) {
    direct.push(`${indent}<tie type="stop"/>`);
    notation.push(`${indent}    <tied type="stop"/>`);
  }
  if (segment.tieToNext) {
    direct.push(`${indent}<tie type="start"/>`);
    notation.push(`${indent}    <tied type="start"/>`);
  }
  return { direct, notation };
}

function noteLines(segment, durationUnits, voiceNumber, chord, indent) {
  const lines = [`${indent}<note>`];
  if (chord) lines.push(`${indent}  <chord/>`);
  lines.push(...pitchLines(segment.midiPitch, `${indent}  `));
  lines.push(`${indent}  <duration>${durationUnits}</duration>`);
  const ties = tieLines(segment, `${indent}  `);
  lines.push(...ties.direct);
  lines.push(`${indent}  <voice>${voiceNumber}</voice>`);
  if (ties.notation.length > 0) {
    lines.push(`${indent}  <notations>`, ...ties.notation, `${indent}  </notations>`);
  }
  lines.push(`${indent}</note>`);
  return lines;
}

function restLines(rest, durationUnits, voiceNumber, indent) {
  return [
    `${indent}<note>`,
    `${indent}  <rest/>`,
    `${indent}  <duration>${durationUnits}</duration>`,
    `${indent}  <voice>${voiceNumber}</voice>`,
    `${indent}</note>`,
  ];
}

function groupVoiceMeasure(measure) {
  const noteGroups = new Map();
  for (const note of measure.notes) {
    const key = rationalKey(note.onsetInMeasure);
    const list = noteGroups.get(key) ?? [];
    list.push(note);
    noteGroups.set(key, list);
  }

  const items = [];
  for (const notes of noteGroups.values()) {
    notes.sort((a, b) => compare(b.durationQuarter, a.durationQuarter) || a.midiPitch - b.midiPitch || a.segmentId.localeCompare(b.segmentId));
    items.push({ kind: 'notes', onset: notes[0].onsetInMeasure, notes });
  }
  for (const rest of measure.rests) items.push({ kind: 'rest', onset: rest.onsetInMeasure, rest });
  items.sort((a, b) => compare(a.onset, b.onset) || (a.kind === 'notes' ? -1 : 1));
  return items;
}

function serializeVoiceMeasure(measure, voiceNumber, divisions, measureUnits) {
  const lines = [];
  let cursorUnits = 0;

  for (const item of groupVoiceMeasure(measure)) {
    const onsetUnits = xmlUnits(item.onset, divisions, 'voice.onset');
    if (onsetUnits > cursorUnits) {
      lines.push('      <forward>', `        <duration>${onsetUnits - cursorUnits}</duration>`, '      </forward>');
      cursorUnits = onsetUnits;
    }
    if (onsetUnits < cursorUnits) {
      fail('OVERLAPPING_PROJECTED_VOICE_EVENTS', 'Projected voice contains overlapping unequal-onset events.', {
        voiceNumber,
        measureIndex: measure.measureIndex,
      });
    }

    if (item.kind === 'rest') {
      const durationUnits = xmlUnits(item.rest.durationQuarter, divisions, 'rest.duration');
      lines.push(...restLines(item.rest, durationUnits, voiceNumber, '      '));
      cursorUnits = onsetUnits + durationUnits;
      continue;
    }

    let longestDurationUnits = 0;
    item.notes.forEach((note, index) => {
      const durationUnits = xmlUnits(note.durationQuarter, divisions, 'note.duration');
      longestDurationUnits = Math.max(longestDurationUnits, durationUnits);
      lines.push(...noteLines(note, durationUnits, voiceNumber, index > 0, '      '));
    });
    cursorUnits = onsetUnits + longestDurationUnits;
  }

  if (cursorUnits < measureUnits) {
    lines.push('      <forward>', `        <duration>${measureUnits - cursorUnits}</duration>`, '      </forward>');
    cursorUnits = measureUnits;
  }
  if (cursorUnits > measureUnits) {
    fail('VOICE_EXCEEDS_MEASURE', 'Projected voice exceeds the measure boundary after serialization.', {
      voiceNumber,
      measureIndex: measure.measureIndex,
      cursorUnits,
      measureUnits,
    });
  }
  return lines;
}

function normalizedClef(options) {
  const sign = typeof options.clefSign === 'string' && options.clefSign.length > 0 ? options.clefSign : 'G';
  const line = Number.isInteger(options.clefLine) && options.clefLine > 0 ? options.clefLine : (sign === 'F' ? 4 : 2);
  return Object.freeze({ sign, line });
}

export function serializeScoreDraftToMusicXml(draft, options = {}) {
  if (!draft || typeof draft !== 'object' || !draft.polyphonicProjection || !draft.context) {
    fail('INVALID_SCORE_DRAFT', 'A ScoreDraft with polyphonicProjection and context is required.');
  }

  const divisions = chooseDivisions(draft);
  const measureUnits = xmlUnits(draft.measureLengthQuarter, divisions, 'measureLengthQuarter');
  const partName = typeof options.partName === 'string' && options.partName.trim() ? options.partName.trim() : 'Transcription Draft';
  const clef = normalizedClef(options);
  const voices = [...draft.polyphonicProjection.voices].sort((a, b) => a.voiceId.localeCompare(b.voiceId, undefined, { numeric: true }));
  const voiceNumber = new Map(voices.map((voice, index) => [voice.voiceId, index + 1]));
  const measureCount = Math.max(1, draft.measures?.length ?? 0, ...voices.map((voice) => voice.lastMeasureIndex + 1));

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="4.0">',
    '  <part-list>',
    '    <score-part id="P1">',
    `      <part-name>${escapeText(partName)}</part-name>`,
    '    </score-part>',
    '  </part-list>',
    '  <part id="P1">',
  ];

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    lines.push(`    <measure number="${measureIndex + 1}">`);
    lines.push('      <attributes>');
    lines.push(`        <divisions>${divisions}</divisions>`);
    if (measureIndex === 0) {
      lines.push('        <time>');
      lines.push(`          <beats>${draft.context.meterNumerator}</beats>`);
      lines.push(`          <beat-type>${draft.context.meterDenominator}</beat-type>`);
      lines.push('        </time>');
      lines.push('        <clef>');
      lines.push(`          <sign>${escapeText(clef.sign)}</sign>`);
      lines.push(`          <line>${clef.line}</line>`);
      lines.push('        </clef>');
    }
    lines.push('      </attributes>');

    const streams = voices
      .map((voice) => ({ voice, measure: voice.measures.find((item) => item.measureIndex === measureIndex) }))
      .filter((stream) => stream.measure !== undefined);

    if (streams.length === 0) {
      lines.push('      <note>', '        <rest/>', `        <duration>${measureUnits}</duration>`, '        <voice>1</voice>', '      </note>');
    } else {
      streams.forEach((stream, index) => {
        lines.push(...serializeVoiceMeasure(stream.measure, voiceNumber.get(stream.voice.voiceId), divisions, measureUnits));
        if (index < streams.length - 1) {
          lines.push('      <backup>', `        <duration>${measureUnits}</duration>`, '      </backup>');
        }
      });
    }
    lines.push('    </measure>');
  }

  lines.push('  </part>', '</score-partwise>');
  return `${lines.join('\n')}\n`;
}

export function createScoreDraftMusicXmlManifest(draft) {
  const segments = draft?.polyphonicProjection?.segments ?? [];
  return Object.freeze({
    schemaVersion: 'score-draft-musicxml-manifest-v0.1',
    serializerVersion: SCORE_DRAFT_MUSICXML_VERSION,
    scoreDraftSchemaVersion: draft?.schemaVersion ?? null,
    sourceEvents: Object.freeze([...new Set(segments.map((segment) => segment.sourceEventId))].map((sourceEventId) => Object.freeze({
      sourceEventId,
      segments: Object.freeze(segments
        .filter((segment) => segment.sourceEventId === sourceEventId)
        .map((segment) => Object.freeze({
          segmentId: segment.segmentId,
          voiceId: segment.voiceId,
          measureIndex: segment.measureIndex,
          onsetInMeasure: segment.onsetInMeasure,
          durationQuarter: segment.durationQuarter,
          tieFromPrevious: segment.tieFromPrevious,
          tieToNext: segment.tieToNext,
        }))),
    }))),
  });
}
