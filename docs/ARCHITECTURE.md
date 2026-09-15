# Architecture

## 1. Product boundary

`st-improvisation-to-score` owns the offline transformation from transcription events into an editable notation draft. It does not own OMR correction, score rendering, playback synthesis, Guitar TAB optimization, or realtime score following.

```text
Audio file
   |
   v
TranscriptionPort
   |  RawPerformanceEvent[]
   v
PerformanceTimeMapper
   |  musical positions + durations
   v
RhythmQuantizer
   |  QuantizedEvent[]
   v
ScoreDraftBuilder
   |  measures / chords / rests / diagnostics
   v
ScoreDraft
   |
   +--> ScoreEditorPort --> teacher review --> MusicXML
   +--> MidiExportPort  --> optional diagnostic MIDI
   +--> TabPort         --> optional Guitar TAB after MusicXML
```

## 2. Authority rules

1. Original audio identity/provenance is immutable metadata.
2. Provider timestamps are evidence, not notation authority.
3. MIDI PPQ/ticks are never the canonical musical clock.
4. MusicXML divisions are interchange values, not the internal clock.
5. After quantization, notation timing uses reduced rational quarter-note values.
6. Ambiguous polyphony creates diagnostics; Stage 00 never invents a voice merely to make a measure add up.
7. Teacher edits in ST Score Editor are authoritative over the generated draft.

## 3. Existing ST components to reuse

### Transcription adapter

Source: `st-omr-correction-engine/providers/basic-pitch`.

Reuse the existing provider boundary for MP3/WAV/M4A/FLAC/OGG -> note events. Do not move correction-engine semantic authority into this repository. The adapter maps provider output into `RawPerformanceEvent`.

### Musical-time adapter

Source semantics: `st-music-workstation` Musical Time, TempoMap, MeterMap.

The repository adopts the same architectural rule: external seconds/ticks are converted at a boundary into an ST-owned musical position. Stage 00 implements the constant-tempo subset locally so the core remains lightweight. A later adapter can consume the Workstation public contract once a suitable stable package boundary exists.

### Polyphony adapter

Source: `guitar-polyphony-lab-` measure timeline / sonority model.

Stage 00 only groups identical snapped onsets as chords and reports overlapping unequal onsets. Stage 02 will add a reviewed adapter/ported contract for sonority spans and bounded voice candidates.

### Score Editor adapter

Source: `st-score-editor-core` public SDK only.

The integration must use the versioned public SDK rather than editor-private packages. The editor receives a generated score draft / MusicXML projection for teacher review. Generated confidence remains metadata and must not silently mutate canonical editor state.

## 4. Stage 00 contracts

### RawPerformanceEvent

```text
eventId
midiPitch          0..127
onsetSeconds       finite >= 0
offsetSeconds      finite > onset
confidence?        0..1
amplitude?         0..1
sourceEventId?
```

One provider note maps to one raw event. Chords are reconstructed later from equal/near-equal quantized attacks.

### QuantizedEvent

```text
eventId
midiPitch
sourceOnsetSeconds
sourceDurationSeconds
onsetQuarter       Rational
durationQuarter    Rational
confidence?
quantizationErrorQuarter
```

### ScoreDraft

```text
bpm
meter
measures[]
  events[]          note/chord/rest
  diagnostics[]
diagnostics[]
```

## 5. Stage 00 rhythm policy

Stage 00 requires user-supplied BPM and meter. This intentionally avoids false confidence from automatic beat tracking.

Regular onset grid is selected from the configured smallest written note:

- 1/8 -> 1/2 quarter-note step
- 1/16 -> 1/4 quarter-note step
- 1/32 -> 1/8 quarter-note step

When `allowTriplets=true`, eighth-note-triplet positions (1/3 quarter-note spacing) are admitted as additional candidates. Duration candidates are bounded common values plus triplet values. Candidate selection is deterministic: smallest absolute error, then shorter value, then earlier position.

## 6. Fail-closed / review behavior

Stage 00 returns diagnostics instead of guessing for:

- non-identical overlapping attacks that imply multiple voices;
- notes crossing a measure boundary without a tie reconstruction path;
- unsupported/invalid BPM or meter;
- invalid transcription events;
- quantized zero/negative duration.

A draft may still be displayed with `REVIEW_REQUIRED`; diagnostics must not globally block safe notation rendering or teacher editing.

## 7. Planned stages

```text
S00 Foundation               contracts + known-tempo quantizer + draft builder
S01 Basic Pitch Adapter      real audio -> RawPerformanceEvent
S02 Polyphony                sonority spans + bounded voice assignment
S03 Score Editor Bridge      ScoreDraft -> public editor SDK / MusicXML review
S04 Automatic Beat/Tempo     beat tracking + tempo-map inference
S05 Rubato                   local tempo curve / expressive timing
S06 Teacher Calibration      confidence + correction feedback corpus
S07 Guitar TAB downstream    optional reviewed MusicXML -> TAB handoff
```
