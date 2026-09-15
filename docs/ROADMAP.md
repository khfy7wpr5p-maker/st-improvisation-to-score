# Roadmap

## S00 — Foundation — COMPLETE

- repository-owned contracts;
- known-BPM/meter rhythm quantization;
- chord grouping and global-silence materialization;
- review remains capability-preserving rather than a global block;
- Node 20/22 CI coverage.

## S01 — Basic Pitch Adapter — COMPLETE

- verified `st-omr-correction-engine` Basic Pitch result contract;
- source audio/provider/model provenance;
- pitch/onset/offset/amplitude -> `RawPerformanceEvent`;
- no invented note confidence;
- generated MIDI remains optional/non-authoritative;
- direct provider-result -> known-tempo `ScoreDraft` composition.

## S02A — Sonority Foundation — COMPLETE

- rational half-open note intervals;
- deterministic boundary-to-boundary sonority spans;
- active/attack/sustained event identities;
- `MONOPHONIC`, `CHORD_ATTACK`, `SUSTAINED_OVERLAP`, `SUSTAINED_SONORITY` classifications;
- ScoreDraft exposes sonority evidence.

## S02B — Polyphony-Default Voice Hints — CURRENT

- polyphonic overlap is ordinary musical input and no longer a review error by itself;
- dynamic voice-strand count rather than fixed 2/4-voice limits;
- sustained-note continuity keeps active voices unavailable to new attacks;
- ended strands are ranked by pitch/register continuity and temporal gap;
- preferred voice plus all eligible alternatives are retained as `NON_CANONICAL_HINT`;
- near-equal candidates produce ambiguity metadata, not a blocked/rejected draft;
- same-onset mixed-duration chords get a split hint without forced separation.

## S02C — Polyphonic Score Materialization — NEXT

- convert voice hints into reversible score-draft voice projections;
- per-voice rest reconstruction after voice projection, not before;
- cross-measure split/tie candidates;
- preserve original quantized events independently from projected voices;
- allow teacher correction to replace any heuristic assignment.

## S03 — ST Score Editor Bridge

- integrate only through `st-score-editor-core` public SDK;
- map ScoreDraft into admitted score/editing surface;
- preserve generated diagnostics and voice alternatives as review metadata;
- teacher correction and exact undo remain editor authority;
- export admitted MusicXML.

## S04 — Automatic Beat / Tempo

- beat/onset feature provider behind adapter;
- tempo candidate generation;
- MeterMap/TempoMap inference;
- compare inferred result against known-tempo teacher corpus;
- low confidence falls back to user guidance instead of rejecting the transcription.

## S05 — Rubato / Expressive Time

- local tempo segments;
- phrase-aware quantization;
- pickup inference;
- no smoothing that changes pitch-event identity.

## S06 — Teacher Calibration

- teacher corrections become versioned evidence;
- measure pitch/onset/duration/rhythm/voice error independently;
- confidence calibration and abstention thresholds;
- no model training from corrections without explicit dataset provenance.

## S07 — Optional Guitar TAB Handoff

- admitted MusicXML can be sent to `musicxml-to-guitar-tab-engine`;
- provisional/review states remain capability-driven;
- TAB failure never invalidates the source notation draft.
