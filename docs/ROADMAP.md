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

## S03A — Score Editor Public Bridge — COMPLETE
Bounded MusicXML projection plus public Score Editor SDK `1.0.0` bridge; standalone MusicXML survives editor failure.

## S03B — Editor Runtime Conformance — COMPLETE
Pinned real `st-score-editor-core` runtime builds and accepts/exports the generated polyphonic MusicXML through the public SDK boundary.

## S04A — Tempo Candidate Analysis — COMPLETE
Bounded onset-derived BPM hypotheses, chord-jitter attack grouping, confidence and explicit half/double ambiguity.

## S04B — Beat / Tempo Provider — COMPLETE
Validated beat-provider evidence, independent beat-period BPM check, consistency/confidence gates and user-BPM precedence.

## S04C — Meter Candidates — COMPLETE
Bounded beat-accent cycle ranking, downbeat phase hints and explicit denominator non-inference.

## S05A — Timing Map Foundation — COMPLETE
Repository-owned provisional tempo/meter change maps with strict ordering, origin invariants and source authority metadata.

## S05B — Piecewise Tempo Mapping — COMPLETE
Boundary-aware quarter/seconds conversion, independent onset/offset mapping across tempo changes and ScoreDraft support for multi-segment tempo maps.

## S05C — Local Tempo Segment Evidence — COMPLETE
Regional beat-window analysis, local tempo changes fitted to observed beat endpoints and non-blocking provisional fallback when timing evidence is weak or ambiguous.

## S05D — Changing Meter / Pickup Projection — COMPLETE
Variable measure topology, off-barline meter-change transition measures, explicit pickup materialization, variable-boundary ties/rests and MusicXML time changes without global blocking.

## S06A — Teacher Correction Ledger — COMPLETE
Append-only teacher authority, open-ended correction dimensions, supersession/revert history and score-level missing-event evidence without destructive source rewrites.

## S06B — Teacher Calibration Metrics — COMPLETE
Independent pitch/onset/duration/rhythm/voice quality metrics, denominator-aware correction rates and category-specific confidence calibration without one misleading combined score.

## S06C — Teacher Overlay / Score Rebuild — COMPLETE
Reversible pitch/onset/duration/rhythm/voice/event overlays rebuild downstream score structure without mutating or re-quantizing the original machine draft.

## S06D — Score Editor Teacher Edit Receipts — COMPLETE
Public authoring receipts feed teacher ledger/overlay rebuild without importing private Score Editor packages or guessing source identity.

## S06E — Source Identity Transport — COMPLETE
Dedicated Score Editor handoff MusicXML carries safe per-segment source-note ids; public SDK revision-aware mappings resolve them back to stable repository `sourceEventId` values.

## S07 — Optional Guitar TAB Handoff — COMPLETE
Capability-driven polyphonic TAB runtime is optional and downstream; source score authority survives TAB failure or review status.

## S08 — End-to-End Audio Runner — COMPLETE

- host-injected real-audio transcription provider without adding Basic Pitch to the core dependency graph;
- verified Basic Pitch result -> ScoreDraft -> MusicXML through one repository-owned orchestration boundary;
- optional Score Editor source-identity open and optional Guitar TAB handoff;
- Editor/TAB failures remain local and cannot change a valid source-score status.

## S09 — Real MP3 Runtime Acceptance — COMPLETE

A rights-clean polyphonic MP3 was generated in CI and passed through the real pinned runtime chain:

- `basic-pitch==0.4.0` produced 5 note events;
- all 5 events reached quantized ScoreDraft evidence;
- reconstructed draft contained 2 voices;
- generated MusicXML was 1,766 bytes;
- Score Editor opened successfully and resolved all 5 source identities;
- Guitar TAB returned `TAB_READY` with `generateTab: true` and `export: true`;
- source MusicXML remained preserved through the TAB handoff.

## S10A — Teacher Acceptance Reporting — COMPLETE

- one report joins pipeline evidence, teacher correction ledger and category-specific calibration;
- pitch/onset/duration/rhythm/voice remain independent;
- meter/tempo/notation corrections stay visible without being hidden inside one score;
- correction burden is reported as workload, not mislabeled as accuracy;
- no hardcoded product-wide acceptance threshold is introduced;
- downstream Editor/TAB status remains descriptive and cannot redefine source-score quality.

## S10B — User-Owned Recording Acceptance — PROVIDER EVIDENCE PENDING

User-recording acceptance no longer requires Score Editor. The default path is:

`MP3/WAV -> transcription provider -> ScoreDraft -> MusicXML -> teacher acceptance report`

Score Editor and Guitar TAB are optional downstream capabilities and are used only when explicitly requested.

A user-owned guitar improvisation recording has reached audio preflight successfully. Canonical transcription quality claims still require the pinned Basic Pitch provider output plus teacher-reviewed corrections. Missing provider runtime must be reported as `TRANSCRIPTION_UNAVAILABLE`; it must not be replaced with a heuristic transcription and must not turn Score Editor availability into a prerequisite.

## S11 — Browser MP3/WAV → MusicXML MVP — IMPLEMENTATION COMPLETE

The first user-facing application is intentionally narrow:

`audio file -> browser Basic Pitch TS -> ST rhythm/polyphony reconstruction -> MusicXML download`

- no Score Editor prerequisite;
- audio inference runs locally in the browser;
- `@spotify/basic-pitch@1.0.1` note events are adapted directly, without promoting generated MIDI to score authority;
- automatic tempo remains provisional when evidence is weak or half/double ambiguous;
- MusicXML remains downloadable under `REVIEW_REQUIRED` when score content is usable;
- the UI exposes file selection, tempo, meter, rhythmic resolution, progress, diagnostics and MusicXML download;
- Node 20/22, Score Editor regression, Guitar TAB regression and real-audio E2E gates passed on the implementation HEAD;
- a Vercel preview and production deployment were created with the S11 code pinned to the validated repository commit;
- GitHub Pages was intentionally removed from the active deployment path because the repository Pages feature is not enabled;
- S10 teacher acceptance remains the authority for real-world quality claims.

## S11C — Real-device Browser Audio Smoke — COMPLETE

The browser audio preparation path now normalizes decoded input to mono 22,050 Hz before Basic Pitch inference. This removes the real-device 44.1/48 kHz model-input mismatch without changing score authority or uploading user audio.

## S12 — Guitar Cleanup and Musical Reconstruction — IMPLEMENTED / CI + PRIVATE ACCEPTANCE PENDING

S12 inserts a reversible musical reconstruction layer between raw browser Basic Pitch evidence and score quantization:

`Basic Pitch raw -> Guitar Cleanup -> attack consolidation -> conservative tempo decision -> duration reconstruction -> quantization/polyphony -> MusicXML`

Implemented behavior:

- raw Basic Pitch events remain immutable and traceable;
- bounded short/weak acoustic candidates can be suppressed only from the derived view;
- near-simultaneous guitar attacks share a musical attack anchor while raw timing is preserved;
- near-simultaneous duplicate pitches can be consolidated with provenance;
- optional pitch-range priors are disabled by default and never assume one universal guitar range;
- half/double tempo ambiguity no longer silently forces the higher BPM grid; alternatives remain visible and the lower rival is provisional when no user BPM is supplied;
- acoustic sustain is no longer directly authoritative for written duration; re-articulation, chord changes and rhythm-grid evidence can reconstruct duration;
- the existing dynamic `POLYPHONY_IS_DEFAULT` allocator remains uncapped and genuine independent strands can still create additional voices;
- repeated diagnostics are grouped instead of flooding the browser result;
- browser results expose raw vs retained event counts, derived voice count and tempo alternatives;
- MusicXML remains available under `REVIEW_REQUIRED`.

Final merge requires Node 20/22 CI, real-audio E2E, Score Editor runtime and Guitar TAB runtime gates. The user-owned recording remains private; actual before/after values for the observed ~709 raw events / 6 voices / ~215.5 BPM case require a local/private rerun and teacher review before any accuracy claim.
