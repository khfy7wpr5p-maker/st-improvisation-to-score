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
        -> measure/rest/chord reconstruction
        -> ScoreDraft
        -> ST Score Editor (planned)
        -> MusicXML (planned)
```

MIDI is an optional diagnostic/export artifact, not the canonical bridge between audio and notation.

## Current verified development surface

- **S00 Foundation — merged:** repository-owned event/context contracts, rational notation timing, known-BPM/meter quantizer, chord grouping, explicit rests, review diagnostics and CI.
- **S01 Basic Pitch Adapter — implemented on development branch:** maps the already-existing `st-omr-correction-engine` Basic Pitch provider result into repository-owned raw events while preserving audio/model provenance and source authority.

The S01 adapter deliberately does not copy generated MIDI bytes into canonical transcription state. It preserves only generated-MIDI SHA-256 provenance; score drafting consumes Basic Pitch note events directly.

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
- `guitar-polyphony-lab-`: polyphonic timeline / sonority concepts;
- `st-score-editor-core`: future public-SDK teacher review and MusicXML projection;
- `musicxml-to-guitar-tab-engine`: optional downstream MusicXML -> Guitar TAB.

## Development

```bash
npm test
npm run check
```

See:

- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/S01_BASIC_PITCH_ADAPTER.md`
