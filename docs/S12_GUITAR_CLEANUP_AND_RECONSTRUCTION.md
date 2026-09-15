# S12 — Guitar Cleanup and Musical Reconstruction

## Status
IMPLEMENTED — pending final CI and private real-user acceptance.

## Purpose
S12 improves real-world guitar MP3/WAV -> MusicXML quality without treating raw acoustic transcription as finished notation.

The stage addresses the observed failure mode where a roughly one-minute guitar improvisation produced about 709 Basic Pitch events, 6 derived voices, an approximately 215.5 BPM provisional tempo, and dense warning/notation noise. Those observations are baseline evidence only; this repository must not claim improved real-user accuracy until the private recording is run again and teacher-reviewed.

## Pipeline

`browser audio -> Basic Pitch raw events -> Guitar Cleanup -> onset/chord consolidation -> tempo decision -> duration reconstruction -> rhythm quantization -> dynamic voice allocation -> MusicXML`

Raw Basic Pitch evidence remains immutable. Cleanup and duration reconstruction create reversible derived views with provenance.

## S12A — Browser Basic Pitch admission

The browser keeps the official Basic Pitch TS provider identity and local-only inference. The browser extraction profile is made less permissive than the earlier MVP by raising the frame threshold and minimum note length. Repository-owned cleanup then applies bounded short/weak candidate filtering without mutating provider evidence.

An optional pitch-range prior exists but is disabled by default. It is applied only when explicitly selected; extended-range instruments are therefore not silently excluded.

## S12B — Guitar attack consolidation

Near-simultaneous attacks are clustered into one musical attack anchor while source onset seconds remain available in provenance. Near-simultaneous duplicate pitches are consolidated only in the derived view. Chord tones are retained as pitches rather than being converted into one pitch or one voice per note.

## S12C — Half/double tempo ambiguity

User BPM remains highest authority. Without user BPM, onset-derived candidates remain non-canonical evidence. When a plausible half/double family remains unresolved, the browser no longer silently lets the higher-ranked high-BPM candidate force the grid: all alternatives remain visible and the lower rival is used only as a provisional editable choice. MusicXML remains available under `REVIEW_REQUIRED`.

## S12D — Duration reconstruction

Basic Pitch offset is evidence, not canonical written duration. The reconstruction layer can shorten acoustic overlap using same-pitch re-articulation and compatible chord-change boundaries, then maps the resulting duration toward the selected rhythmic grid when supported. Source onset/offset seconds remain preserved in provenance.

This reduces the chance that ringing guitar strings create long written values, artificial polyphonic overlap, and excessive voice creation.

## S12E — Dynamic voices

The existing dynamic `POLYPHONY_IS_DEFAULT` allocator remains in place. There is no fixed 2-voice or 4-voice cap. Same-onset chord-like attacks already share one voice candidate; independent overlapping strands can still create additional voices.

S12 reduces false voice inflation primarily before allocation by reconstructing acoustic sustain and consolidating attacks. Genuine counterpoint is not collapsed merely to reduce the displayed voice count.

## S12F — Notation cleanup boundary

Duration and onset reconstruction reduce tiny fragments before normal score quantization/materialization. S12 does not alter pitch merely for engraving simplicity, and Score Editor is not a prerequisite for cleanup.

## S12G — Browser diagnostics

The browser result distinguishes raw detected events from retained musical events, exposes derived voice count and tempo alternatives, and groups repeated diagnostics by code/message with occurrence counts and representative examples. MusicXML download remains enabled under review.

## Safety and authority

- Raw provider events are immutable evidence.
- Cleanup/reconstruction are derived and reversible.
- `REVIEW_REQUIRED` is informative, not a global lock.
- `BLOCKED` remains reserved for malformed/unsafe/resource failures.
- User/teacher timing choices outrank heuristics.
- MIDI is non-canonical.
- Score Editor is optional.
- Guitar TAB is downstream-only.
- No small fixed voice maximum is introduced.
- User-owned audio must not be uploaded to public GitHub or third-party services without explicit approval.

## Validation

Unit/regression coverage includes:

- immutable raw events;
- short/weak candidate suppression with provenance;
- near-simultaneous chord consolidation;
- duplicate-pitch consolidation;
- same-pitch re-articulation duration caps;
- chord resonance duration reconstruction;
- optional pitch-range behavior;
- conservative half/double tempo behavior;
- grouped warning diagnostics;
- continued MusicXML production under review.

Existing Node, real-audio, Score Editor, and Guitar TAB workflow gates remain required before merge.

## Real-user acceptance

The private user-owned guitar recording is the next quality gate after CI. Record before/after values for raw events, retained events, attack groups, voice count, provisional tempo/alternatives, grouped warnings, MusicXML size, and teacher correction burden. Do not label the transcription accurate until teacher review.
