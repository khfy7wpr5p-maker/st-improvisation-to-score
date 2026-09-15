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
  -> durable source identity
  -> teacher correction / MusicXML export
  -> optional Guitar TAB handoff
```

MIDI remains optional diagnostic/export data. It is not the canonical bridge from audio to notation. Guitar TAB is also derived/optional and never replaces the source score.

## Implemented stages

- **S00 Foundation — complete:** repository-owned contracts, known-BPM/meter quantization, rational timing and deterministic CI.
- **S01 Basic Pitch Adapter — complete:** verified Basic Pitch note events -> repository-owned transcription events with provenance.
- **S02A Sonority — complete:** rational half-open active-note spans.
- **S02B Polyphony-Default Voice Hints — complete:** dynamic voice strands; polyphony is normal input, not an error.
- **S02C Polyphonic Materialization — complete:** reversible per-voice measures/rests and cross-measure tie candidates.
- **S03A/S03B Score Editor Bridge — complete:** public SDK MusicXML open/export plus real pinned runtime conformance.
- **S04A–S05D Timing — complete:** tempo/meter candidates, provider admission, piecewise timing, local tempo and changing-meter/pickup projection.
- **S06A–S06E Teacher Workflow — complete:** append-only teacher ledger, calibration, reversible overlay, public authoring receipts and durable source identity through Score Editor edits.
- **S07 Optional Guitar TAB — current:** reviewed MusicXML -> optional pinned Guitar TAB capability; TAB failure remains local and source notation stays usable.

## Product policy

**Polyphony and musical complexity should produce the best usable draft, not unnecessary blocking.**

- voice count is dynamic, not fixed to 2 or 4;
- overlap and cross-measure sustain are normal;
- ambiguous voice choices are hints/warnings;
- same-onset mixed-duration notes remain reversible;
- generated MusicXML survives independently if Score Editor is unavailable;
- TAB generation is optional and cannot invalidate source notation;
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
Guitar TAB                 optional derived performance/arrangement artifact
```

## Score Editor boundary

Generic integration consumes only the Score Editor public SDK contract:

`packages/score-editor-sdk-v1/public.ts`

The host injects a compatible SDK `1.0.0` object. This repository does not import Editor Core private packages.

## Guitar TAB boundary

S07 accepts a host-injected Guitar TAB capability. It prefers the pinned engine's capability-driven `processMusicXmlUpload(...)` application runtime so `PASS`, `REVIEW_REQUIRED`, provisional TAB and local capability degradation remain intact. A legacy package-root converter is retained only as a fallback for compatible simple scores. The general score serializer is not narrowed to satisfy that older parser. Missing/blocked/failed TAB conversion returns `TAB_UNAVAILABLE` while preserving the source MusicXML.

## Development

```bash
npm run check
npm test
```

See `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, and stage notes under `docs/`.
