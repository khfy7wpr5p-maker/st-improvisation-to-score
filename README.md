# ST Improvisation to Score

Teacher-first transcription pipeline for turning a user-owned improvisation recording into an editable notation draft.

## Product flow

```text
MP3/WAV/M4A/FLAC/OGG
        -> existing Basic Pitch provider
        -> Basic Pitch adapter
        -> RawPerformanceEvent[]
        -> musical-time mapping
        -> rhythm quantization
        -> sonority analysis
        -> measure/rest/chord reconstruction
        -> ScoreDraft
        -> ST Score Editor (planned)
        -> MusicXML (planned)
```

MIDI is an optional diagnostic/export artifact, not the canonical bridge between audio and notation.

## Current development surface

- **S00 Foundation — complete:** repository-owned contracts, rational notation timing, known-BPM/meter quantizer, chord grouping, explicit rests and CI.
- **S01 Basic Pitch Adapter — complete:** verified Basic Pitch provider result -> repository-owned raw events with preserved audio/model provenance.
- **S02A Sonority Foundation — implemented:** exact rational half-open note intervals and deterministic `MONOPHONIC` / `CHORD_ATTACK` / `SUSTAINED_OVERLAP` sonority spans.

The system still does not silently assign polyphonic voices. Sustained overlap remains review evidence until the bounded voice-candidate stage.

## Safety / authority rules

- original audio/provider provenance is immutable metadata;
- provider seconds are evidence until quantized;
- MIDI PPQ/ticks are not the canonical musical clock;
- MusicXML divisions are not the internal clock;
- provider confidence is never invented when unavailable;
- unresolved polyphony produces `REVIEW_REQUIRED`, not an arbitrary voice assignment;
- teacher correction in ST Score Editor will outrank generated draft decisions.

## Existing ST projects reused by boundary

- `st-omr-correction-engine`: Basic Pitch audio -> note-event provider;
- `st-music-workstation`: Musical Time / TempoMap / MeterMap semantics;
- `guitar-polyphony-lab-`: half-open interval / sonority-span semantics;
- `st-score-editor-core`: future public-SDK teacher review and MusicXML projection;
- `musicxml-to-guitar-tab-engine`: optional downstream MusicXML -> Guitar TAB.

## Development

```bash
npm test
npm run check
```

See `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/S01_BASIC_PITCH_ADAPTER.md`, and `docs/S02A_SONORITY_FOUNDATION.md`.
