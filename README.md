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
        -> dynamic voice-strand hints
        -> measure/rest/chord reconstruction
        -> ScoreDraft
        -> ST Score Editor (planned)
        -> MusicXML (planned)
```

MIDI is an optional diagnostic/export artifact, not the canonical bridge between audio and notation.

## Current development surface

- **S00 Foundation — complete:** repository-owned contracts, rational notation timing, known-BPM/meter quantizer, chord grouping, global-silence rests and CI.
- **S01 Basic Pitch Adapter — complete:** verified Basic Pitch provider result -> repository-owned raw events with preserved audio/model provenance.
- **S02A Sonority Foundation — complete:** exact rational half-open note intervals and deterministic `MONOPHONIC` / `CHORD_ATTACK` / `SUSTAINED_OVERLAP` sonority spans.
- **S02B Polyphony-Default Voice Hints — implemented:** sustained overlap is normal musical evidence; dynamic voice strands grow as needed and continuation candidates remain non-canonical hints.

## Polyphony policy

**Polyphony is the default, not an exception.**

- overlapping notes do not create `REVIEW_REQUIRED` by themselves;
- sustained bass + moving upper voices are normal input;
- voice count is not fixed to 2 or 4;
- same-onset notes stay chord-like unless later evidence supports a split;
- mixed-duration chords receive a split hint without blocking the draft;
- ambiguous voice continuity keeps a preferred hint plus alternatives and does not block score generation;
- teacher correction in ST Score Editor will remain final authority.

## Safety / authority rules

- original audio/provider provenance is immutable metadata;
- provider seconds are evidence until quantized;
- MIDI PPQ/ticks are not the canonical musical clock;
- MusicXML divisions are not the internal clock;
- provider confidence is never invented when unavailable;
- voice-candidate output is `NON_CANONICAL_HINT`, not a forced score truth;
- hard failure is reserved for structurally invalid/unprocessable input or resource-safety violations, not normal musical complexity.

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

See `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/S01_BASIC_PITCH_ADAPTER.md`, `docs/S02A_SONORITY_FOUNDATION.md`, and `docs/S02B_POLYPHONY_DEFAULT.md`.
