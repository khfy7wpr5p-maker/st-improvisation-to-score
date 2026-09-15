# S01 — Basic Pitch Adapter

Status: **IMPLEMENTED**

## Upstream contract read

The adapter is pinned to the currently verified `st-omr-correction-engine/providers/basic-pitch/basicPitchProvider.js` contract:

- provider id: `spotify_basic_pitch`;
- package version: `0.4.0`;
- source type: `AUDIO_DERIVED`;
- source authority: `SHADOW_EVIDENCE_ONLY`;
- successful results preserve `audioSha256`, `generatedMidiSha256`, provider/model provenance and `noteEvents`;
- each note event exposes `eventId`, `pitchMidi`, `startTimeSeconds`, `endTimeSeconds`, `durationSeconds`, `amplitude`, and optional `pitchBends`.

This repository does **not** import Correction Engine internals directly. A host may run the existing provider and pass the successful immutable result to `adaptBasicPitchProviderResult()`.

## Mapping

```text
Basic Pitch successful result
        |
        v
adaptBasicPitchProviderResult
        |
        +--> immutable provenance
        |      audio SHA-256
        |      generated-MIDI SHA-256
        |      package/model identity
        |      upstream source authority
        |
        +--> RawPerformanceEvent[]
               pitchMidi -> midiPitch
               startTimeSeconds -> onsetSeconds
               endTimeSeconds -> offsetSeconds
               amplitude -> bounded metadata
               confidence -> null (not invented)
```

## Authority rule

The generated MIDI is not required to construct the notation draft and its base64 bytes are deliberately not copied into the transcription batch. Only its SHA-256 provenance is retained. The canonical draft path is:

```text
audio -> Basic Pitch note events -> RawPerformanceEvent -> quantizer -> ScoreDraft
```

not:

```text
audio -> generated MIDI -> canonical notation
```

## Fail-closed rules

The adapter rejects:

- failed provider results;
- provider-id drift;
- source-type or authority promotion;
- Basic Pitch package-version drift from `0.4.0`;
- invalid/missing audio or generated-MIDI hashes;
- duplicate provider event ids;
- invalid MIDI pitches;
- zero/negative note duration;
- more than 100,000 note events.

Amplitude outside the repository-owned `0..1` metadata range is not promoted; the batch becomes `REVIEW_REQUIRED` with an explicit diagnostic instead of discarding the whole pitch/time event.

## Non-goals

S01 does not:

- execute Python or Basic Pitch itself;
- download models;
- perform source separation;
- infer BPM/meter;
- assign polyphonic voices;
- create MusicXML directly;
- treat provider evidence as teacher/gold authority.
