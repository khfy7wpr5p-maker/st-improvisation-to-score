# S04C — Meter Candidates

Status: implementation candidate.

## Goal

Rank beats-per-measure hypotheses from beat-accent periodicity without silently inventing a canonical time signature.

## Evidence

S04C consumes the optional `beatStrengths[]` side of the S04B beat/tempo evidence contract. Strengths must align one-to-one with `beatTimesSeconds[]` and remain bounded in `0..1`.

## Candidate model

- candidate cycle lengths are bounded and configurable;
- each cycle tests every possible downbeat phase;
- score combines downbeat-vs-other accent contrast, repeated-downbeat consistency and cycle coverage;
- related near-equal cycles remain explicit ambiguity evidence;
- weak or flat accent evidence degrades to guidance.

## Beat unit

Accent periodicity can suggest **beats per measure**, but it does not by itself identify whether the beat unit is quarter, eighth, etc. Therefore the denominator is never invented.

A caller may provide a `beatUnitDenominatorHint` from user/provider evidence. Only then can the result become `contextReady`; otherwise the numerator remains a non-canonical hint.

## Authority

Output authority is `NON_CANONICAL_METER_HINT`. Teacher/user meter choices remain higher authority.

## Non-goals

No compound-meter semantic rewrite, pickup inference, changing-meter map, rubato map, automatic score mutation or external beat-tracker dependency is introduced here.
