# Architecture

## Product boundary

`st-improvisation-to-score` owns offline audio-transcription evidence -> editable notation draft. It does not own OMR correction, score rendering, playback synthesis, Guitar TAB optimization, or realtime score following.

```text
Audio
 -> TranscriptionPort
 -> RawPerformanceEvent[]
 -> RhythmQuantizer
 -> QuantizedEvent[]
 -> SonorityAnalyzer
 -> VoiceCandidateAnalyzer
 -> PolyphonicMaterializer
 -> ScoreDraft
 -> MusicXmlProjection
 -> ScoreEditorPublicBridge
 -> teacher review/edit/export
```

## Authority rules

1. Audio/provider provenance remains immutable metadata.
2. MIDI is optional evidence/export, never notation authority.
3. Quantized timing uses repository-owned reduced rational quarter-note values.
4. Polyphony is expected input; overlap is not an error by itself.
5. Voice candidates are `NON_CANONICAL_HINT`.
6. Per-voice score materialization is `REVERSIBLE_HEURISTIC_PROJECTION` and cannot destroy source events.
7. MusicXML is interchange/review projection, not a second internal authority.
8. Once Score Editor admits MusicXML, its canonical score/notation pair and history own teacher edits.
9. Optional editor capabilities degrade locally; they must not invalidate a safe standalone transcription artifact.
10. Hard failure is reserved for structurally invalid/unrepresentable data or resource-safety violations.

## Score Editor public boundary

The only admitted external Editor Core entry is:

`packages/score-editor-sdk-v1/public.ts`

The current bridge requires SDK contract `1.0.0` and does not import Editor Core implementation packages. A host supplies the SDK object. The bridge uses:

- `sdk.version`;
- `sdk.supports('document')` when available;
- `sdk.document.openMusicXml(...)`;
- `sdk.getRevisionGuard()`;
- `sdk.document.exportMusicXml(...)`.

Private controller/session/browser-app/package paths are outside this repository's integration contract.

## MusicXML projection

`serializeScoreDraftToMusicXml()` maps the reversible polyphonic projection to bounded MusicXML 4.0:

- one part by default, configurable part/title/clef metadata;
- meter from transcription context;
- deterministic rational `divisions` within a resource envelope;
- multiple voice streams separated with `backup`;
- same-onset voice events emitted as chord members;
- projected cross-measure note segments emit tie start/stop semantics;
- empty drafts remain serializable as a rest measure.

Pitch spelling is intentionally provisional and deterministic. MIDI pitch is rendered with a simple sharp-based spelling so the pipeline remains usable; later key/enharmonic intelligence or teacher correction may replace it.

A sidecar manifest preserves `sourceEventId -> projected segments` so MusicXML serialization never erases reconstruction provenance.

## Graceful degradation

The Score Editor is an editing surface, not a prerequisite for owning the transcription result.

```text
ScoreDraft -> MusicXML + manifest
                    |
                    +--> editor opens: review/edit/export
                    |
                    +--> editor unavailable/rejects: keep MusicXML + manifest
```

SDK absence, version mismatch, unavailable document capability, or an import error returns a typed bridge failure while retaining MusicXML whenever serialization itself was safe.

## Development sequence

```text
S00 Foundation
S01 Basic Pitch adapter
S02A Sonority
S02B Dynamic voice hints
S02C Reversible polyphonic materialization
S03A MusicXML + public SDK bridge
S03B Real public-SDK runtime conformance
S04 Automatic beat/tempo
S05 Rubato
S06 Teacher calibration
S07 Optional TAB downstream
```
