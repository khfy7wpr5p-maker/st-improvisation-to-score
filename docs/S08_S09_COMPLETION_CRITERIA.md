# S08–S09 Completion Criteria

S08 is complete when the public orchestration API is unit-tested and preserves source-score authority across optional Editor/TAB failures.

S09 is complete when the real runtime workflow passes on the branch HEAD with:

- real MP3 inference via Basic Pitch 0.4.0;
- non-empty provider note evidence;
- non-empty ScoreDraft events;
- MusicXML generation;
- successful Score Editor open + source identity resolution;
- Guitar TAB handoff preserving the exact source MusicXML;
- all ordinary Node CI and previously pinned runtime conformance gates still green.

After S09, the next meaningful validation is teacher acceptance on user-owned recordings.
