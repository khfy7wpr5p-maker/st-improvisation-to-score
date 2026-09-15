# Roadmap

## S00 — Foundation — COMPLETE

- repository-owned contracts;
- known-BPM/meter rhythm quantization;
- chord grouping and monophonic rest materialization;
- unresolved overlaps become review diagnostics;
- Node 20/22 CI coverage.

## S01 — Basic Pitch Adapter — IMPLEMENTED

- consume the verified `st-omr-correction-engine` Basic Pitch provider result contract;
- preserve source audio hash/provider/model provenance;
- map pitch/onset/offset/amplitude into `RawPerformanceEvent`;
- do not invent note confidence;
- keep generated MIDI optional and non-authoritative;
- compose provider result directly into known-tempo `ScoreDraft`;
- fixture-driven adapter tests and contract-drift checks.

## S02 — Polyphonic Reconstruction — NEXT

- introduce sonority-span adapter based on `guitar-polyphony-lab-` semantics;
- bounded voice candidates;
- same-onset chord grouping;
- sustained bass/upper-voice separation;
- no arbitrary voice winner when candidate costs are near-equal.

## S03 — ST Score Editor Bridge

- integrate only through `st-score-editor-core` public SDK;
- map ScoreDraft into admitted score/editing surface;
- preserve generated confidence/diagnostics as review metadata;
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
