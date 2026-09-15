# S10 — Teacher Acceptance / Real Recording Quality

S10 begins only after the real-audio infrastructure gate is green. It measures the musical usefulness of drafts created from user-owned recordings.

## S10A — Acceptance reporting

`buildTeacherAcceptanceReport(...)` combines:

- the audio-to-score pipeline result;
- the append-only teacher correction ledger;
- reviewed denominators for pitch, onset, duration, rhythm and voice;
- optional confidence observations;
- descriptive teacher verdict/notes.

The report deliberately does **not** produce one combined quality score. Pitch, onset, duration, rhythm and voice remain independent because a single percentage can hide the actual failure mode.

Meter, tempo, notation and future correction dimensions remain visible through the correction summary even though they are not folded into the five core calibration categories.

The report also exposes correction workload as `activeCorrectionEntriesPerDetectedEvent`. This is explicitly a workload signal, not an accuracy metric.

## Review states

- `AWAITING_TEACHER_REVIEW` — no teacher denominator/correction evidence yet.
- `TEACHER_REVIEW_IN_PROGRESS` — some correction or review evidence exists, but core-category review is incomplete.
- `TEACHER_REVIEW_RECORDED` — reviewed denominators are available for all five core categories.

These states do not block the draft and do not impose a product-wide pass threshold.

## S10B — User-owned recording acceptance

For each real MP3/WAV recording:

1. run the existing S08 audio pipeline;
2. preserve source audio identity/provenance;
3. inspect the generated score in Score Editor;
4. record teacher corrections instead of silently replacing machine evidence;
5. report pitch/onset/duration/rhythm/voice separately;
6. keep meter/tempo/notation corrections visible;
7. record a descriptive teacher verdict such as `usable after small rhythmic edits`;
8. compare multiple recordings before changing model/provider policy.

No claim of arbitrary-improvisation accuracy is made until real user-owned recordings have been reviewed by a teacher.
