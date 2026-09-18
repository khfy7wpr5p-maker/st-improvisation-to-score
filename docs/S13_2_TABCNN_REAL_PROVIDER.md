# S13.2 TabCNN Real Provider

Status: IMPLEMENTED_AND_BENCHMARKED_PENDING_MERGE  
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
- MIDI pitch implied by standard guitar tuning
- confidence derived from emitted log probability when present
- raw frame provenance

These observations are evidence only. They are not a decided playable TAB and do not create/delete score notes or voices.

## Real benchmark evidence

Workflow: `TabCNN Real Guitar Benchmark`  
Successful run: `#3` / run id `35313285528`  
Head SHA: `30c23607f9b7462a2c9ce965f93aa804d4497f7f`

Benchmark input:

- EGSet12 `01.wav`
- CC BY 4.0
- Zenodo record `11406378`
- audio bytes: `8640044`
- real Basic Pitch normalized events: `272`

Observed TabCNN/CrispASR result:

- provider status: `READY`
- artifact SHA-256: `9582536ba2c43ad35e56d70d4fa150f9ca01dd22c38feeaa54bf0315bd89972c`
- inference elapsed time: `3830.341047 ms` for the recorded run
- raw frame count: `1292`
- projected prediction count: `1921`
- Basic Pitch events with TabCNN support: `147`
- unmatched evidence count: `103`
- position-disagreement event count: `26`
- prediction digest SHA-256: `e0f9c3492591e5c290a0c0760d06e5d5c472c7881d2f673160e22b566e4762aa`
- authority: `SHADOW_EVIDENCE_ONLY`

The workflow executes the same audio/model/runtime tuple twice and requires the prediction digest to match. This benchmark passed.

These numbers are engineering evidence that the real provider runs deterministically through the pipeline. They are not evidence that musical transcription quality has improved. Musical-quality evaluation still requires human review on real guitar material.

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
