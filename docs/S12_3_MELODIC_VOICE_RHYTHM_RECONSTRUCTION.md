# S12.3 — Melodic Voice & Rhythm Reconstruction

## Trigger

Private guitar acceptance after S12.1 reduced provider events from about 709 to 184 and voices from 6 to 4, but the rendered score still showed excessive fragmentation. S12.2 added chord-duration normalization, a half-tempo notation policy, and display-only voice-gap rest suppression.

## Goal

Reduce false voice creation caused by small acoustic overlaps and reduce micro-gap fragmentation while preserving real polyphony.

## Derived reversible behavior

For a single-note attack followed by a nearby-register attack:

- a small overlap of at most 0.25 quarter notes may be capped at the next attack;
- a tiny gap of at most 0.125 quarter notes may be filled to the next attack;
- the next attack must be within 7 semitones by default;
- large overlaps, large gaps, and register-separated material are preserved.

The raw Basic Pitch evidence and prior reconstructed evidence remain unchanged. Every adjustment carries provenance.

## Policy boundaries

- POLYPHONY_IS_DEFAULT.
- No fixed two-voice or four-voice ceiling.
- Register-separated sustained notes remain possible independent voices.
- Large overlaps are not collapsed merely to improve appearance.
- REVIEW_REQUIRED remains non-blocking.
- User/teacher timing choices remain authoritative.

## Acceptance

1. Unit tests prove small overlap capping and micro-gap filling.
2. Unit tests prove large overlap and register-separated preservation.
3. CI and runtime conformance workflows must be green before merge.
4. The same private guitar recording must be rerun after deployment for teacher-reviewed readability acceptance.
