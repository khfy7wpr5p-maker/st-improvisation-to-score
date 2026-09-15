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

## S04A — Tempo Candidate Analysis — CURRENT

- collapse near-simultaneous note attacks before timing analysis;
- generate bounded BPM hypotheses from inter-attack intervals;
- rank candidates against admitted rhythm grids;
- preserve half/double ambiguity explicitly;
- return user/teacher guidance for weak evidence instead of rejection;
- keep candidate authority non-canonical.

## S04B — Beat / Tempo Provider
Adapter for stronger audio beat evidence, beat phase and provider confidence. Admit automatic BPM only when independent beat evidence clears bounded consistency gates.

## S04C — Meter Candidates
Meter/accent candidates and initial TempoMap/MeterMap projection; ambiguous meter stays provisional.

## S05 — Rubato / Expressive Time
Local tempo segments, phrase-aware quantization and pickup inference without changing pitch-event identity.

## S06 — Teacher Calibration
Versioned teacher corrections, separate pitch/onset/duration/rhythm/voice metrics and calibrated confidence.

## S07 — Optional Guitar TAB Handoff
Reviewed MusicXML -> Guitar TAB. TAB failure must never invalidate the source score draft.
