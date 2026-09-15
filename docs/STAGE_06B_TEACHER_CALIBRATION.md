# Stage 06B — Teacher Calibration Metrics

S06B turns teacher-reviewed evidence into inspectable, dimension-specific quality metrics.

## No single accuracy score

Pitch, onset, duration, rhythm and voice are reported independently. The report intentionally sets `combinedAccuracy` to `null`; different musical failure modes must not be hidden by one blended percentage.

## Correction rates

For each core category, the report counts distinct active corrected targets from the S06A ledger. A caller may provide the number of teacher-reviewed opportunities for that category. Only then is a correction rate / teacher-reviewed accuracy calculated.

If a reviewed denominator is absent, accuracy remains `null`. If a denominator is smaller than the distinct corrected-target count, the rate is withheld and a warning is emitted rather than clamped into a plausible-looking number.

## Confidence calibration

Optional teacher-review observations contain:

- category or dimension;
- model confidence in 0..1;
- whether the teacher corrected the output.

Per category, S06B reports:

- observation count;
- mean confidence;
- empirical teacher-reviewed accuracy;
- Brier score;
- expected calibration error (ECE);
- populated confidence bins with confidence/accuracy gap.

Future categories remain visible as uncategorized observations and do not contaminate the five core metrics.

## Authority

These metrics describe reviewed evidence; they do not change the transcription automatically. S06C will apply active teacher corrections as a reversible score overlay while retaining source identity and ledger history.
