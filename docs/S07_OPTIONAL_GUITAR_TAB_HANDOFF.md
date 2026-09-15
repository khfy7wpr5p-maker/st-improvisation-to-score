# S07 — Optional Guitar TAB Handoff

S07 adds a deliberately optional downstream bridge from reviewed MusicXML to `musicxml-to-guitar-tab-engine`.

## Boundary

The source score remains authoritative and independently usable. TAB is a derived artifact.

```text
reviewed MusicXML
  -> injected Guitar TAB capability
  -> capability-driven application runtime when available
  -> canonical/provisional TAB evidence
  -> optional JSON / ASCII / TAB-MusicXML artifacts
```

This repository does not statically import the Guitar TAB repository. The host injects a compatible conversion surface. Runtime conformance pins the tested engine commit:

`1d8ced644f544f7e991f7275eda77a2ce557774e`

Preferred injected surface:

- `processMusicXmlUpload(...)` from the pinned Guitar TAB application runtime;
- use its `status`, `capabilities`, `artifacts`, `canonicalTabResult`, provisional arrangement and review evidence directly.

A legacy package-root fallback remains accepted for simple compatible scores through:

- `preflightMusicXml`
- `convertMusicXmlToCanonicalTab`
- package-root serializers when available.

The legacy package-root parser is intentionally not allowed to narrow the source-score contract. For example, it requires explicit MusicXML `<type>` values and supports a smaller rhythm/polyphony surface. The general score serializer is not rewritten merely to satisfy that older path.

## Failure policy

TAB failure is local capability degradation, not source-score failure.

- missing engine/runtime -> `TAB_UNAVAILABLE`, source MusicXML preserved;
- runtime `BLOCKED` without TAB capability -> `TAB_UNAVAILABLE`, source MusicXML preserved;
- `REVIEW_REQUIRED` with provisional TAB capability -> `TAB_REVIEW_REQUIRED`; provisional TAB remains visible;
- conversion exception -> `TAB_UNAVAILABLE`, source MusicXML preserved;
- one optional artifact serializer failure -> canonical/provisional TAB remains available and the failed artifact becomes a warning;
- source notation and Score Editor work are never invalidated by downstream TAB failure.

This follows the project rule that uncertain or incomplete derived output should stay inspectable/editable when safe, while the teacher remains final musical authority.

## Runtime proof

The S07 conformance workflow checks out the pinned Guitar TAB engine and exercises its capability-driven polyphonic application runtime against repository-generated polyphonic MusicXML. It verifies:

1. polyphonic routing succeeds without forcing the source serializer into the legacy monophonic profile;
2. the runtime exposes `generateTab` capability;
3. retained notes receive concrete string/fret positions;
4. TAB MusicXML and JSON evidence are produced;
5. source MusicXML remains byte-for-byte available;
6. engine absence still leaves the source score intact.
