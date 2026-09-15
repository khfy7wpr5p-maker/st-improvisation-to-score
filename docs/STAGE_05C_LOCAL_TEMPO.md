# Stage 05C — Local Tempo Segment Evidence

S05C treats expressive timing as regional beat evidence, not as a reason to reject transcription.

## Policy

- Polyphony remains normal.
- A single constant BPM is not required.
- Beat-provider evidence stays non-canonical until local deterministic checks admit it.
- User-entered BPM always outranks automatic tempo evidence.
- Half/double ambiguity and weak confidence remain visible warnings.
- Weak evidence still produces a provisional editable draft when a tempo candidate exists.
- Original pitch identity and source onset/offset seconds are never replaced by tempo analysis.

## Pipeline

`beat timeline -> local windows -> regional consistency -> tempo change proposals -> provisional TimingMap -> existing piecewise quantizer -> ScoreDraft`

Local windows are configurable. The implementation does not impose a fixed number of tempo segments or a fixed rubato profile. Stable regional changes may become TimingMap tempo changes; unstable regions stay evidence only.

## Timing-map fitting

Accepted segment boundaries are keyed to beat indices. Segment BPM is recomputed from the actual elapsed time between boundary beats so the map remains continuous with the observed beat timeline. A pre-roll before the first detected beat uses the best anchor tempo until local beat evidence begins.

## Fallback behavior

When local evidence is too weak or retains half/double ambiguity, the pipeline does not return a global BLOCKED state. It creates a provisional constant-tempo draft from the best available provider candidate and marks its timing authority as `PROVISIONAL_PROVIDER_CANDIDATE`.

Changing meter and pickup-aware variable measure boundaries are intentionally deferred to S05D.
