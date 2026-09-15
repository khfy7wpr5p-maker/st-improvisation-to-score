# S02C — Polyphonic Materialization

## Purpose

S02C turns non-canonical voice hints into a reversible notation-oriented projection without changing the underlying quantized transcription evidence.

The stage exists because an editable score needs per-voice measures, rests, and barline-spanning note segments, while audio transcription should remain recoverable independently from those engraving decisions.

## Projection authority

The output is explicitly:

```text
authority = REVERSIBLE_HEURISTIC_PROJECTION
```

It is useful enough to render/edit next, but it is not teacher/gold authority.

## Per-voice materialization

For every preferred voice hint, source events are projected into voice-local measure timelines.

A voice may begin in any measure. Between its first and last active measures, gaps are represented as:

```text
scope = VOICE_GAP
```

This is different from the top-level ScoreDraft's `GLOBAL_SILENCE`, which means no source note sounds at all.

## Cross-measure notes

A source event may span one or many barlines. S02C does not reject or truncate it.

Example:

```text
source event: onset 3.5 quarter, duration 1 quarter in 4/4
```

projects to:

```text
measure 1: onset 3.5, duration 0.5, tieToNext=true
measure 2: onset 0.0, duration 0.5, tieFromPrevious=true
```

The original source event still remains one untouched `QuantizedEvent`.

## Reversibility

Every projected note segment preserves:

- `sourceEventId`;
- source onset;
- source duration;
- preferred voice id and its non-canonical authority;
- whether the voice hint was ambiguous;
- measure index and local onset;
- tie-from/tie-to flags.

A later teacher edit or better reconstruction algorithm can therefore discard and rebuild the projection without losing source pitch/timing evidence.

## Ambiguity and mixed-duration chords

Ambiguous voice continuation and same-onset mixed-duration notes create projection warnings. They do not block the result.

```text
AMBIGUOUS_VOICE_CONTINUATION_PRESERVED
MIXED_DURATION_CHORD_SPLIT_HINT_PRESERVED
```

The projection uses the current preferred hint while keeping the fact that alternatives existed.

## Global-silence correction

Earlier attack-only measure views could incorrectly show a rest after a note crossed a barline. S02C changes global-silence materialization to use the full sounding interval, so a sustained cross-measure note prevents a false rest until it actually ends.

## Resource safety

A high segment-count envelope prevents pathological inputs from exhausting resources. It is not a musical restriction on number of voices, chord density, register, duration, or number of crossed measures.

## Next boundary

S03 should fresh-read the `st-score-editor-core` public SDK and map this reversible projection into the editor without importing private editor packages. Teacher edits must be able to replace any projected voice/rest/tie decision.
