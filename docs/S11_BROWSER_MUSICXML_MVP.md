# S11 — Browser MP3/WAV → MusicXML MVP

## Product goal

Provide the smallest useful user-facing product:

`MP3/WAV -> Basic Pitch TS -> ST musical reconstruction -> MusicXML download`

No Score Editor is required for this flow.

## Runtime model

The first MVP runs transcription in the browser with `@spotify/basic-pitch@1.0.1` and its packaged TensorFlow.js model. The selected audio remains local to the browser. The model is downloaded to the browser from the public package CDN.

The browser note events are adapted into repository-owned `RawPerformanceEvent` values and then pass through the existing ST rhythm/polyphony/voice/measure/MusicXML pipeline. Browser Basic Pitch output does not use generated MIDI as canonical authority.

## User flow

1. Select or drag a `.wav`, `.mp3`, `.ogg`, or `.flac` recording.
2. Choose automatic tempo or provide BPM.
3. Choose meter and smallest rhythmic value.
4. Run transcription.
5. Inspect note count, voice count, provisional tempo and warnings.
6. Download `.musicxml`.

## Non-blocking policy

- Polyphony is normal/default.
- Automatic tempo is a non-canonical hint. Low confidence or half/double ambiguity produces `REVIEW_REQUIRED`, not a blocked download.
- If automatic tempo has no usable candidate, 120 BPM is used only as an explicit provisional grid and a warning is emitted.
- Meter is explicit in the UI. The core browser pipeline still marks an omitted meter as provisional 4/4 when called programmatically.
- MusicXML remains available whenever note-event evidence is structurally usable.

## Privacy

The MVP does not upload the selected audio to an ST server. Audio decoding and Basic Pitch TS inference occur in the browser. Only public model/package assets are downloaded.

## Known limits

- Very long recordings can be limited by device memory and browser performance. This is a warning, not an arbitrary product lock.
- Browser codec support varies. WAV/MP3 are the primary MVP formats.
- Automatic tempo may remain ambiguous for rubato or sparse improvisation.
- S11 does not claim teacher-validated transcription accuracy; S10 acceptance metrics remain the quality evidence layer.
