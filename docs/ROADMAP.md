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
Bounded onset-derived BPM hypotheses, chord-jitter attack grouping, confidence and explicit half/double ambiguity.

## S04B — Beat / Tempo Provider — COMPLETE
Validated beat-provider evidence, independent beat-period BPM check, consistency/confidence gates and user-BPM precedence.

## S04C — Meter Candidates — COMPLETE
Bounded beat-accent cycle ranking, downbeat phase hints and explicit denominator non-inference.

## S05A — Timing Map Foundation — COMPLETE
Repository-owned provisional tempo/meter change maps with strict ordering, origin invariants and source authority metadata.

## S05B — Piecewise Tempo Mapping — COMPLETE
Boundary-aware quarter/seconds conversion, independent onset/offset mapping across tempo changes and ScoreDraft support for multi-segment tempo maps.

## S05C — Local Tempo Segment Evidence — COMPLETE
Regional beat-window analysis, local tempo changes fitted to observed beat endpoints and non-blocking provisional fallback when timing evidence is weak or ambiguous.

## S05D — Changing Meter / Pickup Projection — COMPLETE
Variable measure topology, off-barline meter-change transition measures, explicit pickup materialization, variable-boundary ties/rests and MusicXML time changes without global blocking.

## S06A — Teacher Correction Ledger — CURRENT

- append-only `TEACHER_CONFIRMED` correction evidence;
- preserve original machine/audio evidence instead of overwriting it;
- correction targets may be source events, projected segments, measures, score-level objects or future target kinds;
- keep correction dimensions open-ended while classifying core pitch/onset/duration/rhythm/voice categories for analytics;
- support supersession and explicit revert without deleting history;
- support missing-event additions as score-level teacher evidence;
- keep correction application/writeback separate from immutable audit history.

## S06B — Teacher Calibration Metrics — NEXT
Compute separate correction/error metrics for pitch, onset, duration, rhythm and voice, plus coverage and confidence calibration. Do not collapse independent failure modes into one score.

## S06C — Teacher Overlay / Score Rebuild
Apply active teacher corrections as a reversible overlay to editable score state while preserving source-event identity and audit history.

## S07 — Optional Guitar TAB Handoff
Reviewed MusicXML -> Guitar TAB. TAB failure must never invalidate the source score draft.
