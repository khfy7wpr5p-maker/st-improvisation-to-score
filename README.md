# ST Improvisation to Score

Teacher-first transcription pipeline for turning a user-owned improvisation recording into an editable notation draft.

## Product goal

```text
MP3/WAV/M4A/FLAC/OGG
        -> transcription provider
        -> RawPerformanceEvent[]
        -> musical-time mapping
        -> rhythm quantization
        -> measure/rest/chord reconstruction
        -> ScoreDraft
        -> ST Score Editor
        -> MusicXML
```

MIDI is an optional diagnostic/export artifact, not the canonical bridge between audio and notation.

## Stage 00 status

Stage 00 establishes the repository-owned contracts and a deterministic first-pass rhythm/measure draft engine for **known tempo + known meter**. It deliberately does not claim automatic tempo detection, rubato tracking, full voice separation, or production Basic Pitch/Score Editor integration yet.

Current core:

- validated `RawPerformanceEvent` contract;
- exact rational notation values after the external-seconds boundary;
- known-BPM seconds -> quarter-note mapping;
- regular-grid quantization with optional eighth-note triplet candidates;
- chord grouping for equal snapped onsets;
- measure placement and explicit monophonic gap rests;
- overlap diagnostics instead of silently inventing voices;
- deterministic tests and CI.

## Repository boundaries

Planned adapters consume only reviewed public/stable boundaries from the existing ST projects:

- `st-omr-correction-engine`: Basic Pitch audio -> note-event provider boundary;
- `st-music-workstation`: Musical Time / TempoMap / MeterMap semantics;
- `guitar-polyphony-lab-`: polyphonic timeline / sonority concepts;
- `st-score-editor-core`: public SDK and ScoreDocument/MusicXML review/export surface;
- `musicxml-to-guitar-tab-engine`: optional downstream MusicXML -> Guitar TAB.

The core never makes MIDI PPQ, MusicXML divisions, renderer coordinates, or provider timestamps an independent notation authority.

## Development

```bash
npm test
npm run check
```

See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`.
