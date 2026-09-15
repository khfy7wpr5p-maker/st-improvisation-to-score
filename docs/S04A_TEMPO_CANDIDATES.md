# S04A — Tempo Candidate Analysis

Status: implementation candidate.

## Goal

Derive bounded tempo hypotheses from repository-owned transcription note onsets without turning onset timing into canonical tempo authority.

## Rules

- near-simultaneous attacks are collapsed before interval analysis so chord jitter does not multiply beat evidence;
- candidates are ranked against admitted rhythmic grids;
- half/double tempo aliases remain explicit ambiguity evidence;
- sparse or weak evidence returns guidance instead of an exception;
- output authority is `NON_CANONICAL_TIMING_HINT`;
- S04A never silently replaces the existing known-BPM path;
- automatic tempo admission requires a stronger beat/tempo provider boundary in S04B.

## Output

`analyzeTempoCandidates()` returns:

- distinct attack groups;
- inter-attack intervals;
- bounded ranked BPM candidates;
- fit/support diagnostics;
- confidence;
- half/double ambiguity information;
- `heuristicReady` as evidence only;
- `guidanceRequired` when timing should remain teacher/user guided.

## Non-goals

No audio beat tracker, no meter authority, no TempoMap publication, no rubato curve, no canonical score mutation and no silent BPM selection.
