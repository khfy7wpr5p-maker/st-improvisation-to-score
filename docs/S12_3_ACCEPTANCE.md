# S12.3 Acceptance Checklist

- Small same-register overlaps are capped only within the configured bounded tolerance.
- Tiny same-register gaps are filled only within the configured bounded tolerance.
- Large overlaps remain untouched.
- Register-separated sustained material remains untouched.
- Raw Basic Pitch evidence remains immutable.
- No fixed voice-count cap is introduced.
- REVIEW_REQUIRED remains non-blocking.
- CI, Score Editor Runtime, Guitar TAB Runtime, and Real Audio E2E must all pass on the final PR head.
- Private teacher acceptance is performed only on the user's local recording after deployment.
