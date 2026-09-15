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
SonorityAnalyzer
   |  active/attack/sustained spans
   v
VoiceCandidateAnalyzer
   |  dynamic non-canonical voice hints
   v
ScoreDraftBuilder
   |  measures / chords / global silence / diagnostics
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
6. **Polyphony is expected input.** Overlap does not become an error merely because multiple notes are active.
7. Voice analysis may produce a preferred strand plus alternatives, but these remain `NON_CANONICAL_HINT` until teacher/editor confirmation.
8. Musical complexity should degrade to provisional output or hints before it degrades to rejection.
9. Teacher edits in ST Score Editor are authoritative over the generated draft.

## 3. Existing ST components to reuse

### Transcription adapter

Source: `st-omr-correction-engine/providers/basic-pitch`.

Reuse the existing provider boundary for MP3/WAV/M4A/FLAC/OGG -> note events. Do not move correction-engine semantic authority into this repository. The adapter maps provider output into `RawPerformanceEvent`.

### Musical-time adapter

Source semantics: `st-music-workstation` Musical Time, TempoMap, MeterMap.

The repository adopts the same architectural rule: external seconds/ticks are converted at a boundary into an ST-owned musical position. The current constant-tempo subset remains lightweight. Later tempo-map adapters may widen the timing model without changing event identity.

### Polyphony adapter

Source semantics: `guitar-polyphony-lab-` half-open interval / sonority model.

The repository adapts the deterministic `[onset,end)` active-note semantics into rational notation time. It then adds its own transcription-specific voice-hint layer. There is no fixed musical limit such as exactly two or four voices; strand count grows from the observed overlap structure.

### Score Editor adapter

Source: `st-score-editor-core` public SDK only.

The integration must use the versioned public SDK rather than editor-private packages. The editor receives a generated score draft / MusicXML projection for teacher review. Generated confidence, voice alternatives, and diagnostics remain metadata unless explicitly accepted into canonical editor state.

## 4. Core contracts

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

### VoiceCandidateAnalysis

```text
policy              POLYPHONY_IS_DEFAULT
voiceCountHint       dynamic
assignments[]
  attackGroupId
  eventIds[]
  preferredVoiceId
  candidates[]       eligible prior strands + scores
  activeVoiceIds[]
  ambiguous
  chordLike
  mixedDurations
  splitHint?
authority            NON_CANONICAL_HINT
```

### ScoreDraft

```text
status
polyphonyPolicy
context
quantizedEvents[]
polyphony
voiceCandidates
measures[]
  events[]            note/chord/global-silence-rest
  diagnostics[]
diagnostics[]
```

## 5. Rhythm policy

The current first-pass rhythm engine uses a supplied BPM and meter. These are an initial operating mode, not a permanent product restriction. Automatic tempo/meter and rubato stages will be adapters/policies that feed the same rational musical-time boundary.

Current regular-grid options are implementation defaults for the first pass, not a statement that other rhythmic values are invalid music. Triplet positions are already admitted; later stages may add broader tuplets and adaptive grids.

## 6. Polyphony policy

Polyphony is canonical input evidence:

- sustained notes remain active while later attacks occur;
- a later attack while another strand sustains normally creates or continues another voice hint;
- same-onset notes are initially chord-like because audio alone may not prove a voice split;
- if same-onset notes have different quantized durations, a split hint is preserved;
- ended voice strands are candidate continuations and are ranked by register/pitch continuity plus temporal gap;
- if two candidates are near-equal, both remain available and the draft continues;
- voice hints never rewrite the underlying quantized events.

There is no product-level fixed voice count. Resource-safety envelopes may bound pathological input size, but they are not musical rules.

## 7. Failure / review behavior

Normal musical complexity must not trigger hard failure. In particular, polyphonic overlap is not a review error.

Review metadata is appropriate for reconstructive uncertainty such as unresolved cross-measure tie/split projection. Even then the original draft remains displayable/editable.

Hard failure is reserved for cases such as:

- structurally invalid/unreadable event contracts;
- impossible numeric/timing values;
- unsafe or pathological resource usage;
- input that cannot be represented at all without inventing source events.

`PASS` / `REVIEW_REQUIRED` are document states, not global capability locks.

## 8. Planned stages

```text
S00 Foundation               contracts + known-tempo quantizer + draft builder
S01 Basic Pitch Adapter      real audio -> RawPerformanceEvent
S02A Sonority                rational active-note spans
S02B Voice Hints             polyphony-default dynamic strand candidates
S02C Voice Projection        reversible voices/rests/tie candidates
S03 Score Editor Bridge      ScoreDraft -> public editor SDK / MusicXML review
S04 Automatic Beat/Tempo     beat tracking + tempo-map inference
S05 Rubato                   local tempo curve / expressive timing
S06 Teacher Calibration      confidence + correction feedback corpus
S07 Guitar TAB downstream    optional reviewed MusicXML -> TAB handoff
```
