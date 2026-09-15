# Roadmap

## S00 — Foundation — COMPLETE

- repository-owned contracts;
- known-BPM/meter rhythm quantization;
- chord grouping and monophonic rest materialization;
- unresolved overlaps become review diagnostics;
- Node 20/22 CI coverage.

## S01 — Basic Pitch Adapter — COMPLETE

- verified `st-omr-correction-engine` Basic Pitch result contract;
- source audio/provider/model provenance;
- pitch/onset/offset/amplitude -> `RawPerformanceEvent`;
- no invented note confidence;
- generated MIDI remains optional/non-authoritative;
- direct provider-result -> known-tempo `ScoreDraft` composition.

## S02A — Sonority Foundation — IMPLEMENTED

- rational half-open note intervals;
- deterministic boundary-to-boundary sonority spans;
- active/attack/sustained event identities;
- `MONOPHONIC`, `CHORD_ATTACK`, `SUSTAINED_OVERLAP`, `SUSTAINED_SONORITY` classifications;
- ScoreDraft exposes sonority evidence without assigning voices.

## S02B — Bounded Voice Candidates — NEXT

- derive candidate voices from sustained-note continuity, register and attack evidence;
- score candidates deterministically;
- abstain when top candidates are near-equal;
- never invent a voice to make a measure sum correctly.

## S03 — ST Score Editor Bridge

- integrate only through `st-score-editor-core` public SDK;
- map ScoreDraft into admitted score/editing surface;
- preserve generated diagnostics as review metadata;
- teacher correction and exact undo remain editor authority;
- export admitted MusicXML.

## S04 — Automatic Beat / Tempo

- beat/onset feature provider behind adapter;
- tempo candidate generation;
- MeterMap/TempoMap inference;
- compare inferred result against known-tempo teacher corpus;
- abstain when tempo/meter confidence is insufficient.

## S05 — Rubato / Expressive Time

- local tempo segments;
- phrase-aware quantization;
- bounded pickup inference;
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
