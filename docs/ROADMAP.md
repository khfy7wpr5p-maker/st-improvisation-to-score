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
- `MONOPHONIC`, `CHORD_ATTACK`, `SUSTAINED_OVERLAP`, `SUSTAINED_SONORITY` classifications.

## S02B — Polyphony-Default Voice Hints — COMPLETE

- polyphonic overlap is ordinary musical input;
- dynamic voice-strand count rather than fixed 2/4-voice limits;
- ended strands ranked by register continuity and temporal gap;
- preferred voice plus all eligible alternatives retained as `NON_CANONICAL_HINT`;
- near-equal candidates produce ambiguity metadata, not blocked/rejected drafts.

## S02C — Polyphonic Materialization — CURRENT

- reversible `REVERSIBLE_HEURISTIC_PROJECTION` over untouched quantized events;
- per-voice measure timelines;
- per-voice gap rests after voice projection;
- measure-crossing notes split into tie-candidate segments automatically;
- ambiguous voice choices and mixed-duration chord splits remain warnings/hints rather than blockers;
- global-silence detection accounts for notes sustaining across barlines.

## S03 — ST Score Editor Bridge — NEXT

- fresh-read `st-score-editor-core` public SDK contract;
- map reversible projection into admitted editor score/document structures;
- preserve voice alternatives, source-event identity and tie provenance as review metadata;
- teacher correction and exact undo remain editor authority;
- export admitted MusicXML without requiring a perfect transcription first.

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
