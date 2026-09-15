# S02A — Sonority Foundation

Status: **IMPLEMENTED**

This stage adapts the proven `guitar-polyphony-lab-` half-open interval and sonority-span semantics to this repository's rational musical-time model.

## Input

Quantized events with:

- `eventId`
- `midiPitch`
- `onsetQuarter`
- `durationQuarter`

## Output

`analyzeSonoritySpans()` returns deterministic boundary-to-boundary spans with:

- active event ids;
- attack event ids;
- sustained event ids;
- active MIDI pitches;
- exact rational start/end/duration;
- classification: `MONOPHONIC`, `CHORD_ATTACK`, `SUSTAINED_OVERLAP`, or `SUSTAINED_SONORITY`.

Half-open `[onset,end)` semantics mean a note is no longer active exactly at its end boundary.

## Authority boundary

S02A does not assign voices. A sustained-overlap span is evidence for the later bounded voice-candidate stage, not permission to silently create Voice 2.

`ScoreDraft` now exposes this analysis as `draft.polyphony`; existing overlap diagnostics continue to drive `REVIEW_REQUIRED`.

## Next

S02B will generate bounded voice candidates from sonority continuity, pitch register and attack/sustain evidence, with abstention when candidates are near-equal.
