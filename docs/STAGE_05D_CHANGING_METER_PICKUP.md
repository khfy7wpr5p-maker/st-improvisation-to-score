# Stage 05D — Changing Meter and Pickup Projection

S05D removes the former single-meter ScoreDraft restriction.

## Measure topology

Measure boundaries are derived from the provisional TimingMap. A meter change that lands exactly on a barline starts a normal measure. A meter change that lands inside the currently active nominal bar closes that bar early and creates an implicit transition measure rather than rejecting or moving the change.

Each topology measure records:

- absolute start/end quarter positions;
- actual and nominal measure length;
- active meter;
- whether a meter change starts the measure;
- whether the measure is implicit;
- whether it is an explicit pickup;
- the boundary reason.

## Pickup

A caller may provide `pickupLengthQuarter`. A valid pickup is shorter than the first nominal measure and becomes an implicit first measure. A non-short pickup request is ignored with a warning instead of blocking transcription.

S05D materializes pickup structure; it does not yet claim automatic pickup inference.

## Polyphony

Polyphonic note segments and per-voice rests use each topology measure's actual boundaries. Sustained notes crossing pickup, shortened transition bars, or meter changes remain one source event represented by reversible tied segments.

## MusicXML

Variable-length/pickup measures serialize with `implicit="yes"`. A new `<time>` element is emitted when the active meter changes. Existing constant-meter files retain the same full-measure behavior.

## Product policy

Meter complexity is score structure, not an error state. Unusual but representable boundaries should remain editable and exportable as provisional notation rather than being globally blocked.
