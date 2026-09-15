# S08 — Audio Runner Contract

`runAudioToScorePipeline(request)` is the repository-owned orchestration boundary for real audio.

Required:

- `audioInput`: provider-supported audio path/bytes;
- `sourceId` and `fileName`;
- `context`: current score reconstruction timing context;
- `transcriptionProvider`: host-injected provider function.

Optional:

- provider options;
- Score Editor public SDK and open options;
- Guitar TAB capability and handoff options;
- MusicXML writer options.

The returned object keeps the provider result, ScoreDraft, MusicXML and optional capability results separate. Score Editor or Guitar TAB failure is reported in local diagnostics and cannot turn a valid source score into a failed transcription.
