# S05B — Piecewise Tempo Mapping

Status: implementation candidate.

## Goal

Convert absolute audio seconds to musical quarter-note positions through a position-keyed tempo map rather than one global BPM.

## Mapping

For each tempo segment:

```text
segmentSeconds = quarterDistance × 60 / BPM
```

The mapper integrates all complete earlier segments, then applies the active segment tempo to the local distance. The inverse conversion uses the same accumulated boundaries.

Public operations:

- `quarterPositionToElapsedSeconds()`
- `elapsedSecondsToQuarterPosition()`
- `quantizePerformanceWithTimingMap()`

## Note duration rule

Audio note onset and offset are mapped independently. Musical duration is:

```text
mappedOffsetQuarter - mappedOnsetQuarter
```

This is required for notes that cross a tempo boundary. Their duration must not be derived from one BPM chosen at note onset.

## ScoreDraft integration

`buildScoreDraft(..., { timingMap })` may now consume multiple tempo segments. The timing-map origin BPM/meter must match the transcription context to prevent competing timing authorities.

The current measure builder still admits one meter segment. A valid timing map may contain changing meter for standalone queries, but changing-meter ScoreDraft projection fails explicitly rather than silently placing barlines using the wrong meter.

## Authority and preservation

- pitch event identity is unchanged;
- source onset/offset seconds remain preserved;
- quantized rational timing remains repository-owned notation timing;
- timing-map source authority is preserved per change;
- no rubato segments are inferred in this stage.

## Next

S05C can create bounded local tempo-segment proposals from beat evidence. Those proposals must remain provisional and must satisfy continuity/quality gates before they are used by this piecewise mapper.
