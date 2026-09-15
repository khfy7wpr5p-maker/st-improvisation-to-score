# S04B — Beat / Tempo Provider

Status: implementation candidate.

## Goal

Admit an automatic constant BPM only when a beat/tempo provider supplies enough independent timing evidence to clear deterministic consistency gates.

## Provider boundary

The adapter accepts a successful provider result containing:

- `providerId` and `sourceId`;
- `authority: SHADOW_EVIDENCE_ONLY`;
- strictly increasing `beatTimesSeconds[]`;
- one or more `{ bpm, confidence }` tempo candidates.

Provider output is evidence, not canonical score authority.

## Automatic admission gate

Automatic BPM is admitted only when all are true:

1. enough beats are present;
2. top provider confidence clears the configured minimum;
3. beat spacing is stable enough for a single constant-BPM context;
4. top provider BPM agrees with the median observed beat period;
5. there is no near-equal half/double tempo rival.

If any gate fails, the result is `TEMPO_GUIDANCE_REQUIRED`; no BPM is invented and no draft is blocked or destroyed.

## Authority order

`USER_SUPPLIED` BPM outranks provider evidence. If a context already contains an explicit BPM, `buildScoreDraftFromBeatTempoProvider()` preserves that value and returns `USER_TEMPO_DRAFT_READY`.

Otherwise admitted provider evidence may produce `AUTO_TEMPO_DRAFT_READY`.

## Non-goals

No specific third-party beat-tracker dependency is selected here. No meter authority, rubato curve, tempo-map segmentation, source-audio mutation or canonical editor mutation is introduced.
