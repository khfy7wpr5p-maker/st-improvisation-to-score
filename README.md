# ST Improvisation to Score

Teacher-first transcription pipeline for turning user-owned improvisation audio into an editable notation draft.

## Current flow

```text
MP3/WAV/M4A/FLAC/OGG
  -> Basic Pitch provider
  -> RawPerformanceEvent[]
  -> rational musical time + quantization
  -> sonority analysis
  -> dynamic voice hints
  -> reversible polyphonic projection
  -> per-voice rests + tie candidates
  -> MusicXML projection
  -> ST Score Editor public SDK
  -> teacher correction / MusicXML export
```

MIDI remains optional diagnostic/export data. It is not the canonical bridge from audio to notation.

## Implemented stages

- **S00 Foundation — complete:** repository-owned contracts, known-BPM/meter quantization, rational timing and deterministic CI.
- **S01 Basic Pitch Adapter — complete:** verified Basic Pitch note events -> repository-owned transcription events with provenance.
- **S02A Sonority — complete:** rational half-open active-note spans.
- **S02B Polyphony-Default Voice Hints — complete:** dynamic voice strands; polyphony is normal input, not an error.
- **S02C Polyphonic Materialization — complete:** reversible per-voice measures/rests and cross-measure tie candidates.
- **S03A Score Editor Public Bridge — implemented:** ScoreDraft -> MusicXML plus an injected Score Editor SDK `1.0.0` public-boundary bridge.

## Product policy

**Polyphony is the default. Musical complexity should produce the best usable draft, not unnecessary blocking.**

- voice count is dynamic, not fixed to 2 or 4;
- overlap and cross-measure sustain are normal;
- ambiguous voice choices are hints/warnings;
- same-onset mixed-duration notes remain reversible;
- generated MusicXML survives independently if Score Editor is unavailable;
- hard failure is reserved for invalid/unrepresentable data or resource-safety problems;
- teacher edits remain final musical authority.

## Authority layers

```text
RawPerformanceEvent        provider evidence
QuantizedEvent             repository timing draft
VoiceCandidateAnalysis     NON_CANONICAL_HINT
PolyphonicProjection       REVERSIBLE_HEURISTIC_PROJECTION
MusicXML                   interchange/review projection
Score Editor canonical doc teacher-edit authority after admitted import
```

## Score Editor boundary

Generic integration consumes only the Score Editor public SDK contract:

`packages/score-editor-sdk-v1/public.ts`

The host injects a compatible SDK `1.0.0` object. This repository does not import Editor Core private packages. The bridge uses only public `document.openMusicXml`, revision guard, and `document.exportMusicXml` operations.

## Development

```bash
npm run check
npm test
```

See `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and stage notes under `docs/`.
