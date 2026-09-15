# Stage 06A — Teacher Correction Ledger

Teacher correction is a first-class authority layer, not a destructive rewrite of transcription evidence.

## Principles

- Raw audio-derived and machine-derived evidence remains immutable.
- Teacher decisions are append-only audit entries with `TEACHER_CONFIRMED` authority.
- Revert creates a new ledger entry; it never deletes the original decision.
- A later correction may supersede an earlier correction while preserving both in history.
- Core calibration categories are pitch, onset, duration, rhythm and voice, but the ledger accepts open-ended correction dimensions for future notation and pedagogy needs.
- Missing-event additions can be represented as score-level correction evidence instead of requiring a pre-existing machine event.
- The ledger is a sidecar authority/provenance layer; applying corrections back into an editable score model is a separate bounded stage.

## Entry model

A correction records:

- correction id and sequence;
- teacher/actor id;
- target kind + target id;
- open-ended dimension;
- derived reporting category;
- `before` and `after` JSON-like evidence;
- optional note and timestamp;
- optional superseded correction id.

A revert references an earlier active correction. Active corrections are derived from the full immutable entry history.

## Calibration direction

S06B will use this ledger to calculate separate correction/error statistics for pitch, onset, duration, rhythm and voice. Categories must not be collapsed into one generic accuracy number.
