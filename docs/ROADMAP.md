# Roadmap

## S00 — Foundation — COMPLETE
Repository-owned contracts, rational timing, known-tempo/meter quantization and CI.

## S01 — Basic Pitch Adapter — COMPLETE
Verified Basic Pitch result -> raw events with audio/provider/model provenance; generated MIDI stays non-authoritative.

## S02A — Sonority — COMPLETE
Half-open rational note intervals and active/attack/sustained sonority spans.

## S02B — Polyphony-Default Voice Hints — COMPLETE
Dynamic voice strands, continuation candidates and non-blocking ambiguity metadata. No fixed 2/4-voice product limit.

## S02C — Polyphonic Materialization — COMPLETE
Reversible per-voice measure projection, `VOICE_GAP` rests, multi-measure tie candidates and corrected global-silence coverage.

## S03A — Score Editor Public Bridge — COMPLETE
Bounded MusicXML projection plus public Score Editor SDK `1.0.0` bridge; standalone MusicXML survives editor failure.

## S03B — Editor Runtime Conformance — COMPLETE
Pinned real `st-score-editor-core` runtime builds and accepts/exports the generated polyphonic MusicXML through the public SDK boundary.

## S04A — Tempo Candidate Analysis — COMPLETE
Bounded onset-derived BPM hypotheses, chord-jitter attack grouping, confidence and explicit half/double ambiguity. Candidate authority remains non-canonical.

## S04B — Beat / Tempo Provider — COMPLETE
Validated beat-provider evidence, independent beat-period BPM check, consistency/confidence gates and user-BPM precedence.

## S04C — Meter Candidates — CURRENT

- preserve optional beat-strength evidence from the beat provider;
- rank bounded accent-cycle lengths and downbeat phases;
- keep related cycle ambiguity explicit;
- never infer a beat-unit denominator from accent strength alone;
- allow a caller-supplied beat-unit hint to make a meter context usable;
- keep meter output `NON_CANONICAL_METER_HINT` until teacher/provider confirmation.

## S05A — Timing Map Foundation — NEXT
Repository-owned provisional TempoMap/MeterMap contract with constant initial segments and explicit authority metadata.

## S05B — Rubato / Expressive Time
Local tempo segments, phrase-aware quantization and pickup inference without changing pitch-event identity.

## S06 — Teacher Calibration
Versioned teacher corrections, separate pitch/onset/duration/rhythm/voice metrics and calibrated confidence.

## S07 — Optional Guitar TAB Handoff
Reviewed MusicXML -> Guitar TAB. TAB failure must never invalidate the source score draft.
