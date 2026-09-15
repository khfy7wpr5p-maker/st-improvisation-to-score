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

## S06A — Teacher Correction Ledger — COMPLETE
Append-only teacher authority, open-ended correction dimensions, supersession/revert history and score-level missing-event evidence without destructive source rewrites.

## S06B — Teacher Calibration Metrics — COMPLETE
Independent pitch/onset/duration/rhythm/voice quality metrics, denominator-aware correction rates and category-specific confidence calibration without one misleading combined score.

## S06C — Teacher Overlay / Score Rebuild — CURRENT

- apply active teacher corrections as a derived overlay while preserving the original machine draft;
- rebuild from corrected quantized score state rather than re-quantizing corrected teacher timing;
- support pitch, onset, duration, rhythm, voice, spurious-event deletion and missing-event insertion;
- preserve teacher voice authority through polyphonic materialization;
- preserve source score extent/pickup by default;
- keep unsupported future correction dimensions in the ledger and expose non-blocking unapplied warnings;
- make revert restore machine-derived state on the next rebuild;
- keep corrected draft directly MusicXML/Score Editor compatible.

## S06D — Editor Correction Round Trip — NEXT
Map Score Editor edit operations into the teacher ledger/overlay contract and prove edit -> ledger -> rebuild -> MusicXML round trip through the public SDK boundary.

## S07 — Optional Guitar TAB Handoff
Reviewed MusicXML -> Guitar TAB. TAB failure must never invalidate the source score draft.
