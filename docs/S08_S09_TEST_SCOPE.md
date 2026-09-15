# S08–S09 Test Scope

The automated real-audio gate answers a narrow question: can a real MP3 travel through the pinned provider/runtime boundaries and remain a usable editable score artifact?

It does not claim transcription quality on arbitrary performances. That requires user-owned recordings and teacher correction evidence.

The automated gate must fail if the real Basic Pitch model cannot run, if provider provenance is invalid, if no note evidence reaches ScoreDraft, if generated MusicXML cannot open in the pinned Score Editor SDK, or if the pinned Guitar TAB runtime loses the source score boundary.
