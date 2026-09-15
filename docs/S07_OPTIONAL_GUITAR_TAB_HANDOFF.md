# S07 — Optional Guitar TAB Handoff

S07 adds a deliberately optional downstream bridge from reviewed MusicXML to `musicxml-to-guitar-tab-engine`.

## Boundary

The source score remains authoritative and independently usable. TAB is a derived artifact.

```text
reviewed MusicXML
  -> optional Guitar TAB engine
  -> preflight
  -> CanonicalTabResult
  -> optional JSON / ASCII / TAB-MusicXML artifacts
```

The bridge does not import Guitar TAB engine internals. A compatible engine object is injected by the host. Runtime conformance pins the tested engine commit:

`1d8ced644f544f7e991f7275eda77a2ce557774e`

The admitted package-root functions are:

- `preflightMusicXml`
- `convertMusicXmlToCanonicalTab`
- `serializeCanonicalTabResult`
- `serializeCanonicalTabResultToAscii`
- `serializeCanonicalTabResultToMusicXml`

## Failure policy

TAB failure is local capability degradation, not source-score failure.

- missing engine -> `TAB_UNAVAILABLE`, source MusicXML preserved;
- blocked TAB preflight -> `TAB_UNAVAILABLE`, source MusicXML preserved;
- conversion exception -> `TAB_UNAVAILABLE`, source MusicXML preserved;
- one artifact serializer failure -> canonical TAB remains available and the failed artifact becomes a warning;
- engine `requiresTeacherReview: true` -> `TAB_REVIEW_REQUIRED`, not a global block.

This follows the project rule that uncertain or incomplete derived output should stay inspectable/editable when safe, while the teacher remains final musical authority.

## Runtime proof

The S07 conformance workflow checks out the pinned Guitar TAB engine, feeds repository-generated MusicXML through its real package root and verifies:

1. conversion succeeds;
2. each note receives a concrete string/fret position;
3. ASCII TAB and TAB MusicXML are produced;
4. source MusicXML remains byte-for-byte available;
5. engine absence still leaves the source score intact.
