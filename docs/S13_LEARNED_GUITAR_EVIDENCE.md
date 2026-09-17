# S13 — Basic Pitch + TabCNN/FretNet learned guitar evidence

Status: INITIAL SHADOW INTEGRATION

## Goal

Keep Basic Pitch note/onset extraction and immutable source evidence intact while admitting guitar-specific learned evidence from TabCNN- and FretNet-style providers.

## Pipeline

```text
audio
  |
  +-- Basic Pitch --------------------> immutable note/onset events
  |
  +-- TabCNN runtime bridge ----------> string/fret note evidence
  |
  +-- FretNet runtime bridge ---------> string/fret + continuous pitch contour evidence
                                         |
                                         v
                              GuitarEvidenceFusion
                                         |
                              SHADOW_EVIDENCE_ONLY
                                         |
                       cleanup / reconstruction / MusicXML
```

The S13 initial slice does not execute upstream TabCNN or FretNet models. It defines the stable repo-local contracts that runtime hosts must feed.

## Authority

- Basic Pitch events remain the current transcription input.
- TabCNN/FretNet evidence is `SHADOW_EVIDENCE_ONLY`.
- Learned evidence may support, disagree with, or remain unmatched to a Basic Pitch event.
- Learned evidence cannot delete a Basic Pitch event, mutate pitch/timing, force a string/fret choice, create a notation voice, or block MusicXML in this slice.
- A string/fret disagreement is evidence, not an error: one pitch can have multiple physically valid guitar positions.

## Normalized evidence

Each observation can carry:

- onset/offset seconds;
- MIDI pitch;
- guitar string index (1..6);
- fret (0..36);
- confidence;
- optional technique label;
- optional continuous pitch contour points.

The TabCNN adapter declares `STRING_FRET_NOTE_EVIDENCE`.
The FretNet adapter declares `STRING_FRET_NOTE_EVIDENCE` and `CONTINUOUS_PITCH_CONTOUR_EVIDENCE`.

The adapters currently consume bridge-normalized provider output. Parsing upstream project-specific tensors/files belongs in a provider host, not in the score engine core.

## Fusion

`fuseGuitarEvidence()` matches learned observations to Basic Pitch events using bounded pitch and temporal proximity. It exposes:

- supported Basic Pitch event count;
- multi-provider support count;
- continuous-contour support count;
- string/fret disagreement count;
- unmatched learned evidence;
- per-event provider matches and provenance.

No fusion score is yet allowed to change reconstruction.

## Next gate

S13.1 should add real provider-host execution behind optional/offline or server-side adapters and benchmark it on rights-clean or explicitly approved audio. Only after measured precision/calibration should learned evidence be allowed to influence cleanup/ranking, and even then source truth and teacher overrides remain higher authority.
