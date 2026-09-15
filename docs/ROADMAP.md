# Roadmap

## S00 — Foundation — COMPLETE
Repository-owned contracts, rational timing, known-tempo/meter quantization and CI.

## S01 — Basic Pitch Adapter — COMPLETE
Verified Basic Pitch result -> raw events with audio/provider/model provenance; generated MIDI stays non-authoritative.

## S02A — Sonority — COMPLETE
Half-open rational note intervals and active/attack/sustained sonority spans.

## S02B — Polyphony-Default Voice Hints — COMPLETE
Dynamic voice strands, continuation candidates and non-blocking ambiguity metadata. No fixed 2/4-voice product limit.

## S02C — Polyphonic Materialization — COMPLETE
Reversible per-voice measure projection, `VOICE_GAP` rests, multi-measure tie candidates and corrected global-silence coverage.

## S03A — Score Editor Public Bridge — CURRENT

- serialize reversible projection to bounded MusicXML 4.0;
- preserve source-event -> projected-segment sidecar manifest;
- emit multi-voice streams with MusicXML `backup`;
- emit chord and cross-measure tie semantics;
- integrate through injected Score Editor SDK `1.0.0` only;
- use public `document.openMusicXml` / `document.exportMusicXml` operations;
- preserve standalone MusicXML if SDK/capability/import fails;
- never import Editor Core private package paths.

## S03B — Editor Runtime Conformance — NEXT

- run the bridge against the real Score Editor public SDK runtime in an integration environment;
- verify generated MusicXML open/export round trip;
- verify semantic targets and revision guard behavior;
- preserve source-event manifest alongside editor document identity;
- keep renderer/playback/optional-capability failures local.

## S04 — Automatic Beat / Tempo
Beat/onset provider, tempo candidates and TempoMap/MeterMap inference. Low confidence falls back to user guidance rather than rejection.

## S05 — Rubato / Expressive Time
Local tempo segments, phrase-aware quantization and pickup inference without changing pitch-event identity.

## S06 — Teacher Calibration
Versioned teacher corrections, separate pitch/onset/duration/rhythm/voice metrics and calibrated confidence.

## S07 — Optional Guitar TAB Handoff
Reviewed MusicXML -> Guitar TAB. TAB failure must never invalidate the source score draft.
