# S05A — Timing Map Foundation

Status: implementation candidate.

## Goal

Introduce one repository-owned provisional timing-map contract that can carry tempo and meter changes at explicit musical positions without changing existing known-BPM transcription behavior.

## Model

```text
TimingMap
  tempoChanges[]
    positionQuarter
    bpm
    sourceAuthority

  meterChanges[]
    positionQuarter
    numerator
    denominator
    sourceAuthority
```

The design follows the same architectural principle used by ST Music Workstation: tempo and meter are independent ordered change sequences keyed by musical position. This repository owns its own lightweight contract and does not import Workstation runtime internals.

## Invariants

- tempo and meter sequences are separately ordered;
- both begin at musical position zero;
- later changes are strictly increasing;
- musical positions use reduced repository rational quarter-note values;
- each change preserves its source authority;
- the map authority is `PROVISIONAL_TIMING_MAP`;
- map construction is immutable and deterministic;
- no implicit sorting, repair or default insertion is performed for malformed input.

## Current composition

The existing constant BPM/meter transcription context is now represented as a one-segment timing map. This keeps current quantization behavior unchanged while giving later stages a stable place to add local tempo or meter changes.

Beat-provider automatic BPM is marked `ADMITTED_BEAT_PROVIDER_EVIDENCE`. Explicit user BPM is marked `USER_SUPPLIED` and remains the higher authority.

## Non-goals

S05A does not infer rubato, pickup measures or changing meter. It does not yet remap seconds through multiple tempo segments. Those are later stages built on this contract.
