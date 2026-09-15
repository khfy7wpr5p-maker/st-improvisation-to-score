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

## S05B — Piecewise Tempo Mapping — CURRENT

- integrate ordered tempo segments into elapsed-seconds conversion;
- provide exact boundary-aware quarter -> seconds and seconds -> quarter mapping;
- map note onset and offset independently across tempo changes;
- quantize mapped performance without changing pitch-event identity;
- allow ScoreDraft to consume multiple tempo segments;
- require timing-map origin to agree with transcription context;
- fail explicitly on changing-meter ScoreDraft projection until the measure builder supports it.

## S05C — Local Tempo Segment Evidence — NEXT
Generate bounded local tempo-segment proposals from stronger beat evidence, with continuity and stability gates. Do not infer expressive timing from note events alone when beat evidence is insufficient.

## S05D — Changing Meter / Pickup Projection
Materialize meter changes and pickup structure into variable measure boundaries without discarding the provisional timing map.

## S06 — Teacher Calibration
Versioned teacher corrections, separate pitch/onset/duration/rhythm/voice metrics and calibrated confidence.

## S07 — Optional Guitar TAB Handoff
Reviewed MusicXML -> Guitar TAB. TAB failure must never invalidate the source score draft.
