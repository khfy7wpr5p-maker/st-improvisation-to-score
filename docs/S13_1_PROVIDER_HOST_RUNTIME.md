# S13.1 — Provider-host runtime

Status: IMPLEMENTED_HOST_RUNTIME / MODEL_ARTIFACT_GATE_REMAINS

## Goal

Run optional learned guitar transcription providers as isolated subprocesses while preserving the S13 authority boundary:

- Basic Pitch remains the current transcription event source.
- TabCNN and FretNet remain `SHADOW_EVIDENCE_ONLY`.
- A learned provider being absent, slow, or broken must not block score generation.
- Provider output is normalized and fused only as evidence.

## Runtime protocol

`runExternalGuitarEvidenceProvider()` starts a configured executable with `shell: false`, writes one JSON request to stdin, and expects one JSON object on stdout.

Request:

```json
{
  "schemaVersion": "external-guitar-evidence-host-request-v0.1",
  "providerId": "tabcnn | fretnet",
  "audioPath": "/path/to/audio.wav",
  "metadata": {}
}
```

TabCNN host output is expected to match the existing adapter shape:

```json
{
  "providerVersion": "...",
  "predictions": [
    {
      "onsetSeconds": 0.0,
      "offsetSeconds": 0.5,
      "midiPitch": 64,
      "stringIndex": 1,
      "fret": 0,
      "confidence": 0.9
    }
  ]
}
```

FretNet host output is expected to match the existing adapter shape:

```json
{
  "providerVersion": "...",
  "notes": [
    {
      "onsetSeconds": 0.0,
      "offsetSeconds": 0.5,
      "midiPitch": 64,
      "stringIndex": 1,
      "fret": 0,
      "confidence": 0.9,
      "pitchContour": []
    }
  ]
}
```

## Failure policy

Provider execution is explicitly non-blocking for score work:

- missing executable -> `UNAVAILABLE / EXECUTABLE_NOT_FOUND`
- timeout -> `UNAVAILABLE / TIMEOUT`
- non-zero exit -> `UNAVAILABLE / NON_ZERO_EXIT`
- malformed JSON -> `FAILED / INVALID_JSON_OUTPUT`
- valid payload -> `READY`

The pipeline can fuse whichever providers are READY and records the others without manufacturing evidence.

## Research implementation boundary

### Original TabCNN

Reference repository: `andywiggins/tab-cnn`.

The original implementation targets Python 2.7 with Keras/TensorFlow and is primarily a research train/test codebase rather than a modern packaged inference service. It is therefore not vendored into this repository.

### FretNet

Reference repository: `cwitkowitz/guitar-transcription-continuous`.

The repository builds on `amt-tools` and previous guitar-transcription research code, and provides experiment/evaluation workflows. A ready-to-embed production inference executable plus redistributable checkpoint has not been established by this stage, so no checkpoint is silently bundled.

### Modern TabCNN reimplementations

Third-party Python 3/PyTorch reimplementations exist, but they are not treated as the original authoritative implementation. Any checkpoint/code selected later must receive explicit provenance and license review before production use.

## What S13.1 proves

- the app can execute an external learned provider process;
- audio path and metadata cross a bounded JSON protocol;
- output can feed the existing TabCNN/FretNet adapters and `GuitarEvidenceFusion`;
- two READY providers can reach multi-provider consensus;
- one unavailable provider does not prevent the other from contributing evidence;
- Basic Pitch source events remain immutable.

## Remaining gate for real model acceptance

S13.2 must select/pin concrete model artifacts and prove:

1. reproducible installation,
2. reproducible checkpoint identity (hash),
3. license/redistribution status,
4. actual inference on rights-clean guitar audio,
5. timing/pitch/string/fret calibration against labelled data,
6. latency and memory envelope,
7. disagreement statistics versus Basic Pitch,
8. no authority promotion before benchmark thresholds are met.
