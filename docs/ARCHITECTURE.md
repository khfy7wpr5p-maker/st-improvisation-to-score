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
   |  dynamic NON_CANONICAL_HINT voice strands
   v
PolyphonicMaterializer
   |  REVERSIBLE_HEURISTIC_PROJECTION
   |  per-voice measures / rests / tie candidates
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
7. Voice analysis may produce a preferred strand plus alternatives, but these remain `NON_CANONICAL_HINT`.
8. Polyphonic materialization is explicitly reversible and must not mutate the underlying `QuantizedEvent[]`.
9. Cross-measure notes are represented as tie-candidate projection segments while the source event remains whole.
10. Musical complexity should degrade to hints/provisional projection before it degrades to rejection.
11. Teacher edits in ST Score Editor are authoritative over generated draft/projection decisions.

## 3. Existing ST components to reuse

### Transcription adapter

Source: `st-omr-correction-engine/providers/basic-pitch`.

Reuse the existing provider boundary for MP3/WAV/M4A/FLAC/OGG -> note events. Do not move correction-engine semantic authority into this repository. The adapter maps provider output into `RawPerformanceEvent`.

### Musical-time adapter

Source semantics: `st-music-workstation` Musical Time, TempoMap, MeterMap.

External seconds/ticks are converted at a boundary into ST-owned musical positions. The current constant-tempo subset is an initial operating mode, not a permanent product restriction.

### Polyphony adapter

Source semantics: `guitar-polyphony-lab-` half-open interval / sonority model.

The repository adapts deterministic `[onset,end)` semantics into rational notation time, then adds transcription-specific dynamic voice hints and reversible projection. There is no fixed musical limit such as exactly two or four voices.

### Score Editor adapter

Source: `st-score-editor-core` public SDK only.

The integration must use the versioned public SDK rather than editor-private packages. Generated confidence, alternative voice candidates, projection warnings, and tie provenance remain metadata unless explicitly accepted into canonical editor state.

## 4. Core contracts

### RawPerformanceEvent

```text
eventId
midiPitch
onsetSeconds
offsetSeconds
confidence?
amplitude?
sourceEventId?
```

### QuantizedEvent

```text
eventId
midiPitch
onsetQuarter       Rational
durationQuarter    Rational
source timing/provenance
```

### VoiceCandidateAnalysis

```text
policy              POLYPHONY_IS_DEFAULT
voiceCountHint       dynamic
assignments[]
  attackGroupId
  eventIds[]
  preferredVoiceId
  candidates[]
  activeVoiceIds[]
  ambiguous
authority            NON_CANONICAL_HINT
```

### PolyphonicScoreProjection

```text
authority            REVERSIBLE_HEURISTIC_PROJECTION
voices[]
  voiceId
  measures[]
    notes[]           projected note/tie segments
    rests[]           VOICE_GAP
segments[]
  sourceEventId
  measureIndex
  onsetInMeasure
  durationQuarter
  tieFromPrevious
  tieToNext
warnings[]
```

Every projected segment retains `sourceEventId`, source onset and source duration so projection can be regenerated or discarded without losing transcription evidence.

### ScoreDraft

```text
status
polyphonyPolicy
context
quantizedEvents[]
polyphony
voiceCandidates
polyphonicProjection
measures[]            attack/global-silence view
diagnostics[]
warnings[]
```

## 5. Rhythm policy

The first-pass engine currently accepts supplied BPM and meter. These values make the initial personal-use workflow predictable; they are not intended as mandatory permanent constraints. Automatic tempo/meter and rubato stages will feed the same rational musical-time model.

Current quantization grids are implementation defaults, not definitions of valid music. Later stages may widen tuplets and adaptive rhythmic candidates without changing event identity.

## 6. Polyphony policy

- sustained notes remain active while later attacks occur;
- later attacks may dynamically create additional voice strands;
- ended strands are ranked as continuation candidates using register/pitch continuity and temporal gap;
- same-onset notes are initially chord-like because audio alone may not prove a voice split;
- mixed-duration same-onset events retain split hints;
- ambiguous continuation choices preserve alternatives rather than stopping output;
- per-voice rests are created only after voice projection;
- notes may cross any number of barlines and are split into reversible tie-candidate segments;
- the source `QuantizedEvent` is never chopped up or overwritten by projection.

## 7. Failure / review behavior

Normal musical complexity must not trigger hard failure. Polyphonic overlap and cross-measure sustain are normal.

Warnings are appropriate for heuristic uncertainty such as ambiguous voice continuation or mixed-duration chord interpretation. They do not disable rendering/editing/export preparation.

Hard failure is reserved for:

- structurally invalid/unreadable event contracts;
- impossible numeric/timing values;
- pathological resource usage outside safety envelopes;
- internal contract mismatch that would otherwise invent or lose source events.

`PASS` / future `REVIEW_REQUIRED` document states must remain separate from capabilities.

## 8. Planned stages

```text
S00 Foundation               contracts + known-tempo quantizer + draft builder
S01 Basic Pitch Adapter      real audio -> RawPerformanceEvent
S02A Sonority                rational active-note spans
S02B Voice Hints             polyphony-default dynamic strand candidates
S02C Materialization         reversible voices/rests/tie projection
S03 Score Editor Bridge      projection -> public editor SDK / MusicXML review
S04 Automatic Beat/Tempo     beat tracking + tempo-map inference
S05 Rubato                   local tempo curve / expressive timing
S06 Teacher Calibration      confidence + correction feedback corpus
S07 Guitar TAB downstream    optional reviewed MusicXML -> TAB handoff
```
