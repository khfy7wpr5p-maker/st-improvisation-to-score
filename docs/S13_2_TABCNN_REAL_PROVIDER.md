# S13.2 TabCNN Real Provider

Status: IMPLEMENTED_WITH_REAL_BENCHMARK_EVIDENCE_GGUF_METADATA_GATE_RECOVERED_PENDING_FINAL_PR_HEAD_REVALIDATION  
Date: 2026-09-18

## Purpose

S13.2 connects a real TabCNN model to the existing S13.1 external learned-evidence host without allowing learned evidence to become score truth.

The production authority boundary remains:

- Basic Pitch supplies the score-generation note/onset source.
- TabCNN supplies optional string/fret evidence only.
- TabCNN authority is always `SHADOW_EVIDENCE_ONLY`.
- TabCNN failure, absence, timeout, malformed output, or artifact mismatch must not block Basic Pitch or MusicXML generation.
- FretNet remains deferred until its own verified checkpoint/provenance gate exists.

## Pinned model artifact

- Model repository: `cstr/tabcnn-GGUF`
- Model file: `tabcnn-f16.gguf`
- Runtime: CrispASR
- Weights licence: CC BY 4.0
- Source record: `https://zenodo.org/records/11406378`
- Exact GGUF SHA-256: `9582536ba2c43ad35e56d70d4fa150f9ca01dd22c38feeaa54bf0315bd89972c`
- Exact GGUF size: `1781824` bytes
- Pinned tuning: `E2 A2 D3 G3 B3 E4`
- Pinned open-string MIDI: `40 45 50 55 59 64`
- Source artifact provenance SHA-256: `1470a308896629352a811082843eb708cbc2f1aa3092757340055ef76a53ed0c`

The exact GGUF checksum is enforced by `config/models/tabcnn-f16.json` and independently rechecked by the TabCNN Artifact Provenance workflow. The real-guitar benchmark also reads `tabcnn.tuning` directly from the verified GGUF and requires it to match the pinned manifest before inference evidence is accepted.

No model binary is committed to this repository. Normal score generation never silently downloads or replaces model weights.

## CrispASR invocation

The S13.2 provider host executes the verified model with the equivalent runtime command:

```bash
crispasr --tab -m <verified-tabcnn-f16.gguf> -f <audio-file> --tab-format json
```

The subprocess boundary uses `shell: false`. Before CrispASR is started, the local GGUF must pass SHA-256 verification against the committed manifest.

## Evidence semantics

CrispASR exposes TabCNN as frame-level six-string fret emissions. S13.2 preserves that raw frame evidence and projects bounded note-like observations for the existing `GuitarEvidenceFusion` interface.

The projection never assumes a generic standard tuning. It receives `openMidiByString` from the validated model manifest, whose pitch-name tuning is cross-checked against the verified GGUF.

The projection records:

- frame time and frame period
- one-based score-side string index `1..6`
- original zero-based provider string index in metadata
- fret
- MIDI pitch implied by the verified model manifest tuning
- confidence derived from emitted log probability when present
- raw frame provenance

These observations are evidence only. They are not a decided playable TAB and do not create/delete score notes or voices.

## Real benchmark evidence

Workflow: `TabCNN Real Guitar Benchmark`  
Successful recovery run: `#34` / run id `35391558358`  
Implementation verification head: `9abc49d05efbb88396f318dd6fc110a2ddf41190`

Benchmark input:

- EGSet12 `01.wav`
- CC BY 4.0
- Zenodo record `11406378`
- audio bytes: `8640044`
- real Basic Pitch normalized events: `272`

Observed TabCNN/CrispASR result:

- provider status: `READY`
- artifact SHA-256: `9582536ba2c43ad35e56d70d4fa150f9ca01dd22c38feeaa54bf0315bd89972c`
- inference elapsed time: `3655.122438 ms` for the recorded recovery run
- raw frame count: `1292`
- projected prediction count: `1921`
- Basic Pitch events with TabCNN support: `147`
- unmatched evidence count: `103`
- position-disagreement event count: `26`
- prediction digest SHA-256: `8e4f662738586a32ca6f3420a64447c8f347a4ab43dca2f752f89f5695985d3f`
- authority: `SHADOW_EVIDENCE_ONLY`

The workflow executes the same audio/model/runtime tuple twice and requires the prediction digest to match. Run `35391558358` passed this determinism check.

The digest differs from the older historical `e0f9...` evidence because the provider bridge advanced to v0.2 after that run and prediction objects now preserve verified manifest-derived tuning metadata such as `modelOpenMidi`. The current benchmark hashes the complete prediction objects, so that intentional evidence-shape change changes the digest. The current-head repeated runs still match each other.

These numbers are engineering/runtime evidence that the real provider runs deterministically through the pipeline. They are not evidence that musical transcription quality has improved. Musical-quality evaluation still requires human review on real guitar material.

## GGUF metadata verifier recovery

Root cause:

- the benchmark workflow used `PYTHONPATH=".integration/CrispASR/ggml/gguf-py"`
- pinned CrispASR commit `e4b59c9fb97a155da91395862e2fa26f77f1c7c7` points its `ggml` submodule at `CrispStrobe/ggml@2dd13eddc783f2cd0a29324affd78081cc6f0034`
- that pinned ggml tree does not contain `gguf-py`
- therefore `from gguf import GGUFReader` failed with `ModuleNotFoundError` even though the CrispASR build and exact model SHA verification were valid

Recovery:

- added a cheap GGUF reader preflight before the expensive CrispASR build
- first confirmed RED on run `35391444770`, where the preflight reproduced the same missing-module defect
- pinned `gguf==0.19.0` in the benchmark environment
- added a preflight that verifies the installed package version and imports `GGUFReader`
- removed the nonexistent CrispASR-local `gguf-py` PYTHONPATH assumption
- retained the existing exact model SHA-256 check, runtime commit pin, and direct `tabcnn.tuning` comparison against `config/models/tabcnn-f16.json`

Recovery implementation commit: `9abc49d05efbb88396f318dd6fc110a2ddf41190`.

Six-gate verification on that implementation head:

1. `CI` — SUCCESS — run `35391558236`
2. `Score Editor Runtime Conformance` — SUCCESS — run `35391558264`
3. `Guitar TAB Runtime Conformance` — SUCCESS — run `35391558275`
4. `Real Audio End-to-End Conformance` — SUCCESS — run `35391558327`
5. `TabCNN Artifact Provenance` — SUCCESS — run `35391558249`
6. `TabCNN Real Guitar Benchmark` — SUCCESS — run `35391558358`

This documentation update moves the PR head without changing runtime behavior. Merge remains prohibited until the same six required gates are successful on the then-current PR head. The PR body records the final current-head workflow IDs before merge.

## Failure behavior

Expected non-authoritative outcomes include:

- missing model -> `UNAVAILABLE`
- missing CrispASR executable -> `UNAVAILABLE`
- model SHA mismatch -> provider cannot become `READY`
- malformed CrispASR JSON -> provider cannot become `READY`
- timeout / non-zero exit -> learned provider remains non-blocking

The existing Basic Pitch / score / MusicXML path remains available when learned evidence is unavailable.

## Benchmark attribution

The real-guitar CI fixture comes from EGSet12, Zenodo record `11406378`, under CC BY 4.0. The benchmark workflow records the dataset attribution and DAFx 2024 citation note in its GitHub Actions job summary.

## Deferred after S13.2

- FretNet real checkpoint integration
- playable constrained TAB decoding from TabCNN emissions
- learned-evidence authority over reconstruction
- automatic deletion or suppression of Basic Pitch events
- browser/mobile on-device TabCNN inference
