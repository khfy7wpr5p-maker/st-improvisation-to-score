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

## S06C — Teacher Overlay / Score Rebuild — COMPLETE
Reversible pitch/onset/duration/rhythm/voice/event overlays rebuild downstream score structure without mutating or re-quantizing the original machine draft.

## S06D — Score Editor Teacher Edit Receipts — CURRENT

- consume public Score Editor SDK `1.0.0` authoring action receipts without importing private editor packages;
- preserve action id, document/revision provenance and before/after evidence in the teacher ledger;
- use explicit host-kept `sourceEventId` when available; never infer source identity from opaque editor IDs or target ordering;
- let unmapped editor targets remain auditable/non-blocking until an identity bridge is available;
- map public duration edits to teacher duration overlay while keeping accidental/tie/slur semantics as notation evidence;
- prove real public `authoring.commitKeypad` -> host receipt -> ledger -> overlay rebuild -> MusicXML -> public SDK reopen/export;
- keep `teacherWorkflow: false` limitation explicit rather than claiming an SDK edit journal that does not exist.

## S06E — Source Identity Transport — NEXT
Create a durable source-event identity bridge across generated MusicXML and Score Editor public boundaries, or adopt a future public `teacherWorkflow`/edit-journal capability when available. Do not rely on import order as identity.

## S07 — Optional Guitar TAB Handoff
Reviewed MusicXML -> Guitar TAB. TAB failure must never invalidate the source score draft.
