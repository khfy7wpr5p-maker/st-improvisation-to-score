# S02B — Polyphony-Default Voice Hints

## Purpose

S02B changes the product assumption from “overlap requires review” to **polyphony is normal input**.

The stage does not force final engraved voices. It creates dynamic strand hints that help the later score-materialization layer while preserving every quantized source event unchanged.

## Input

`QuantizedEvent[]` from the rhythm layer.

Events are first grouped by exact quantized onset. A same-onset group is treated as one chord-like attack group because audio evidence alone does not prove that simultaneously attacked pitches belong to separate notation voices.

## Dynamic voice strands

The analyzer maintains as many strands as the music requires.

For each new attack group:

1. strands still sounding at the attack onset are marked active and cannot be reused by that attack;
2. ended strands remain eligible continuations;
3. eligible strands are ranked by pitch/register distance plus temporal gap;
4. the best-ranked strand becomes `preferredVoiceId`;
5. all eligible alternatives remain attached to the assignment;
6. if no strand is free because existing strands are sustaining, a new strand is created dynamically.

There is no fixed 2-voice or 4-voice product rule.

## Ambiguity

A close score margin between the first two continuation candidates creates:

```text
ambiguous = true
```

but does **not** create a blocked document and does not remove the preferred hint. The teacher/editor layer can later select another candidate or rewrite the voice structure entirely.

## Same-onset mixed durations

If simultaneously attacked pitches quantize to different durations, S02B preserves them as a chord-like source group and adds:

```text
SAME_ONSET_MIXED_DURATIONS_MAY_REQUIRE_MULTIPLE_VOICES
```

as a split hint. It does not force a split because multiple notation interpretations may be valid.

## Authority

Every assignment is explicitly:

```text
authority = NON_CANONICAL_HINT
```

The underlying `QuantizedEvent[]` remains independent from voice hints. Later projection can therefore be regenerated, compared, rejected, or replaced by teacher edits without losing source timing/pitch evidence.

## ScoreDraft behavior

Sustained overlap no longer creates `POLYPHONIC_OVERLAP_REQUIRES_REVIEW`.

A typical guitar texture such as:

```text
bass:   E2  ─────────────────
upper:       G3 ── A3 ── B3 ──
```

is expected to produce two dynamic strand hints while the document remains usable.

Global silence gaps may still be represented before per-voice rest materialization. S02C will create reversible per-voice score projection, rests, cross-measure splits and tie candidates.

## Resource safety vs musical rules

The implementation keeps a high event-count safety envelope to prevent pathological resource use. That limit is not a statement about acceptable musical polyphony, number of voices, chord size, register, instrument, or texture.
