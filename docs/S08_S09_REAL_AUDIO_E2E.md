# S08–S09 — Real Audio End-to-End Test Path

S08 closes the repository-level audio orchestration gap. S09 proves that the orchestration can consume a real MP3 through the pinned Basic Pitch runtime and continue through the real Score Editor and optional Guitar TAB runtimes.

## S08 — Audio runner

`runAudioToScorePipeline(...)` accepts a host-injected transcription provider and keeps provider execution outside the repository dependency graph.

```text
MP3/WAV/M4A/FLAC/OGG
  -> host-injected Basic Pitch provider
  -> verified Basic Pitch provider result
  -> RawPerformanceEvent[]
  -> ScoreDraft
  -> MusicXML
  -> optional Score Editor public SDK
  -> optional Guitar TAB capability
```

The current reconstruction call still receives a timing context (`bpm`, meter and quantization preference). Automatic timing evidence remains available in the repository but is not silently substituted for an explicit context in this first end-to-end runner.

## Failure policy

- provider failure stops before score reconstruction and returns explicit provider provenance/failure;
- Score Editor failure does not invalidate ScoreDraft or MusicXML;
- Guitar TAB failure does not invalidate ScoreDraft or MusicXML;
- source score status is driven by transcription/reconstruction evidence, not by optional downstream capabilities;
- raw audio is not copied into the returned score artifact; the admitted provider SHA/fingerprint is retained through the provider result.

## S09 — real runtime conformance

CI generates a rights-clean two-gesture WAV and encodes it to MP3. The workflow then uses:

- `st-omr-correction-engine@122725676cb1f2cb0eddb05d791bd11abea13b32` for the Basic Pitch provider host;
- `basic-pitch==0.4.0` for real model inference;
- `st-score-editor-core@4d8920c81ebb34af31f62f4a8e9ba24a4d7d7e15` for the public Score Editor SDK;
- `musicxml-to-guitar-tab-engine@1d8ced644f544f7e991f7275eda77a2ce557774e` for the optional Guitar TAB runtime.

The gate verifies:

1. the MP3 fingerprint survives the provider boundary;
2. Basic Pitch returns one or more real note events;
3. those note events become quantized ScoreDraft events;
4. MusicXML is generated;
5. Score Editor opens the generated score and resolves source identities;
6. the optional Guitar TAB runtime receives the same source MusicXML and preserves it;
7. the TAB runtime exposes a usable generate-TAB capability for the rights-clean fixture.

This is a real model/runtime integration test. It is not a quality claim for arbitrary recordings. User-recording validation remains a corpus/acceptance activity performed with the user's own MP3/WAV material and teacher review.
