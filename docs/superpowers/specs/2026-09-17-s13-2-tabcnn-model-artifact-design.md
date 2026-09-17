# S13.2 TabCNN Model Artifact Integration Design

Date: 2026-09-17
Project: st-improvisation-to-score
Status: design approved in chat; implementation not started

## Goal

Connect one real, pinned TabCNN model artifact to the S13.1 optional provider-host runtime so guitar audio can produce real string/fret evidence alongside Basic Pitch. Keep learned evidence shadow-only until benchmark and calibration gates are passed.

## Current baseline

- Basic Pitch remains the authoritative note/onset source for the current score pipeline.
- S13 introduced normalized TabCNN/FretNet shadow evidence adapters and GuitarEvidenceFusion.
- S13.1 introduced optional subprocess provider-host execution with READY / UNAVAILABLE / FAILED outcomes, timeout/output bounds, shell disabled, and non-blocking behavior.
- Score generation must continue when learned providers are unavailable or fail.

## Verified external constraints

### Original TabCNN

The original `andywiggins/tab-cnn` repository is a research implementation built for Python 2.7 with Keras/TensorFlow. Its documented flow trains on GuitarSet and writes fold-specific weights; it does not provide a production inference service or a clearly licensed ready-to-ship model artifact.

### FretNet

The official `cwitkowitz/guitar-transcription-continuous` repository is MIT licensed and includes FretNet research/inference code, but its general Usage section is still incomplete and the repository publishes no GitHub Release containing a ready checkpoint. FretNet therefore remains optional and UNAVAILABLE until a checkpoint passes a separate provenance/license/hash gate.

### Selected TabCNN artifact candidate

Use the CrispASR-compatible `cstr/tabcnn-GGUF` artifact family, with `tabcnn-f16.gguf` as the initial parity/reference candidate. The model card identifies the weights as CC BY 4.0 and provides provenance to the EGSet12 Zenodo record and source-model checksum metadata. The model emits six per-string distributions over fret classes and is explicitly an emission scorer, not a complete playable-tab decoder.

The provider must read the model frontend metadata from the GGUF/runtime rather than hard-code guessed preprocessing values.

## Architecture

```text
Audio file
   |
   +--> Basic Pitch --------------------> note/onset events
   |
   +--> TabCNN provider host
           |
           +--> CrispASR executable
           +--> pinned tabcnn-f16.gguf
           +--> JSON frame/string/fret evidence
                    |
                    v
              TabCNN adapter
                    |
                    v
            GuitarEvidenceFusion
                    |
                    v
             SHADOW_EVIDENCE_ONLY
                    |
              diagnostics/benchmark

FretNet provider host
   -> remains UNAVAILABLE unless a separately approved checkpoint exists
```

## Artifact policy

The implementation must pin and verify all of the following before inference is accepted as READY:

- provider runtime identity/version
- artifact source URL or registry identifier
- model filename
- model license identifier
- expected SHA-256 for the exact GGUF bytes
- model architecture/backend identity
- frontend metadata required by the model

Hash mismatch, missing metadata, unsupported backend, missing executable, or missing model file must produce an explicit provider status and must not block Basic Pitch or MusicXML generation.

The repository must not silently download or replace model weights during normal score generation. Automatic acquisition, if later added, requires an explicit artifact-install step with license attribution and checksum verification.

## Provider output contract

The TabCNN host will return normalized frame evidence sufficient for the existing adapter/fusion layer:

- frame time
- string index
- fret class or silent class
- score/probability/log-probability where available
- provider version
- artifact identity/hash

A host-side bridge may convert frame emissions into bounded note-like observations for S13 compatibility, but the raw frame evidence must remain available in diagnostics/provenance so later decoding can improve without losing source evidence.

## Authority boundary

S13.2 does not allow TabCNN to:

- delete Basic Pitch notes
- create or remove score voices
- force final string/fret assignments
- override teacher corrections
- block MusicXML generation
- become source truth

It may only add evidence, agreement/disagreement diagnostics, and benchmark measurements.

## Benchmark and calibration gate

Before learned evidence may influence reconstruction ranking, run a rights-clean guitar benchmark and record at minimum:

- provider READY rate
- inference runtime
- supported Basic Pitch event count
- multi-provider support count when FretNet later exists
- string/fret agreement and disagreement counts
- unmatched evidence count
- false-support examples on known synthetic/annotated fixtures
- deterministic output for the same audio/model/runtime tuple

No claim of improved musical quality is allowed from CI alone. A real guitar test must be reviewed separately.

## Testing

Implementation tests must cover:

1. correct artifact/hash -> provider READY
2. wrong hash -> provider rejected without blocking score generation
3. missing executable -> UNAVAILABLE
4. missing model -> UNAVAILABLE
5. malformed provider JSON -> FAILED, non-blocking
6. normalized TabCNN evidence reaches GuitarEvidenceFusion
7. Basic Pitch input objects remain unchanged
8. existing CI, Score Editor Runtime, Guitar TAB Runtime, and Real Audio E2E remain green

A deterministic fixture may emulate the provider protocol, but it must be clearly separated from the real-model benchmark and must never be reported as real TabCNN inference.

## Implementation sequence

1. Add a model-artifact manifest/schema and verification helper.
2. Add a CrispASR TabCNN provider-host bridge using S13.1 subprocess infrastructure.
3. Pin the selected GGUF artifact metadata and checksum in configuration/documentation, not as an unverified binary committed to source.
4. Add tests for artifact verification and provider status behavior.
5. Add a rights-clean real-guitar benchmark workflow/job that runs only when the real runtime/model artifact is available.
6. Keep FretNet as UNAVAILABLE with explicit reason until a separate checkpoint/provenance gate is completed.
7. Merge only after required repository CI/runtime gates are green on the final PR head.

## Acceptance criteria

S13.2 is complete when:

- a real TabCNN provider can be executed through S13.1 using a verified pinned GGUF artifact;
- its evidence is normalized and fused with Basic Pitch without mutating score truth;
- artifact provenance and checksum are visible in diagnostics;
- unavailable/failed learned providers never block MusicXML;
- deterministic tests pass;
- all existing integration workflows pass on the final head;
- at least one rights-clean real-guitar inference result is recorded separately from fixture tests.

## Explicitly deferred

- FretNet training/checkpoint production
- playable constrained TAB decoding from TabCNN emissions
- learned-evidence authority over reconstruction
- automatic deletion/suppression of Basic Pitch events
- browser/mobile on-device TabCNN inference
