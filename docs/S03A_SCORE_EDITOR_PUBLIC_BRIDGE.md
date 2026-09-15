# S03A — Score Editor Public Bridge

## Purpose

S03A creates a generic boundary from the transcription ScoreDraft to ST Score Editor without coupling this repository to Editor Core internals.

## Verified Editor contract

Fresh-read from `st-score-editor-core`:

- public entry: `packages/score-editor-sdk-v1/public.ts`;
- SDK contract: `1.0.0`;
- SDK is an integration boundary, not canonical score authority;
- public document operations include `openMusicXml` and revision-guarded `exportMusicXml`;
- generic consumers must not import browser-app, app-document, EditorSession or other private implementation packages.

## Boundary

This repository therefore produces a standard MusicXML projection first and accepts an SDK instance from its host:

```text
ScoreDraft
  -> serializeScoreDraftToMusicXml
  -> MusicXML + source-event manifest
  -> openScoreDraftInEditor(injectedSdk, draft)
  -> sdk.document.openMusicXml(...)
```

There is no direct cross-repository private import.

## Failure semantics

Editor integration failure is local.

If the SDK is missing, incompatible, lacks the document capability, throws, or rejects MusicXML, the bridge returns a typed failure that still contains the already-generated MusicXML and provenance manifest whenever serialization succeeded.

This deliberately prevents an optional review surface from becoming a global transcription lock.

## MusicXML scope

The first writer supports the current reversible projection:

- multiple dynamic voices;
- per-voice rests;
- chords;
- meter;
- configurable clef metadata;
- cross-measure tie start/stop;
- deterministic provisional MIDI-pitch spelling;
- bounded exact rational duration conversion.

It does not claim final enharmonic spelling, key inference, articulation recovery, fingering or expressive notation.

## Provenance

`createScoreDraftMusicXmlManifest()` keeps each source event linked to its projected segments, voice hint, measure location and tie boundaries. MusicXML itself remains an interchange artifact; the manifest carries reconstruction provenance that MusicXML does not need to encode.

## Next

S03B should run this bridge against the actual Score Editor SDK runtime and verify open -> semantic targets/revision guard -> export round trip before claiming production integration.
