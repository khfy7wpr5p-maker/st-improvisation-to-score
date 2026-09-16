# S12.2 — Musical Score Simplification

## Trigger

The private guitar acceptance rerun after S12.1 improved provider admission from about 709 detected events / 6 voices / 215.5 BPM to 184 events / 4 voices / 156.5 BPM, but the rendered notation remained visually fragmented and too dense for teacher use.

No private recording is committed to this repository.

## Goal

Improve readability of the derived MusicXML without destroying provider evidence or imposing a fixed voice count.

## Implemented behavior

1. **Low-confidence high-tempo half-family policy**
   - automatic tempo remains non-canonical;
   - when the top automatic tempo is high and confidence is below timing authority, a half-tempo family member is admitted as the provisional notation grid;
   - the original high candidate remains visible as an alternative;
   - an explicit user BPM always wins.

2. **Reversible same-attack duration simplification**
   - near-equal durations inside the same guitar attack may be normalized to a shared written duration;
   - a compatible following attack is preferred as the shared boundary when all tones are close to it;
   - otherwise a representative existing duration is used only when the spread is bounded;
   - materially different durations remain untouched;
   - provenance records each changed event.

3. **Display-only voice-gap rest suppression**
   - the analysis score keeps the original projected voice-gap rests;
   - the browser MusicXML display score removes those explicit rests;
   - the serializer then uses MusicXML `<forward>` time movement, reducing visible rest clutter while preserving timing;
   - source notes, voices, ties, and raw evidence remain available.

## Boundaries

- `POLYPHONY_IS_DEFAULT` remains authoritative.
- No fixed 2-voice or 4-voice cap is introduced.
- `REVIEW_REQUIRED` remains non-blocking.
- Raw Basic Pitch evidence is immutable.
- The simplification layer is derived and reversible.
- Teacher/user BPM remains authoritative.
- Real musical quality must still be confirmed with the same private guitar recording after deployment.

## Acceptance

Merge only when:

- Node CI is green;
- Score Editor Runtime Conformance is green;
- Guitar TAB Runtime Conformance is green;
- Real Audio End-to-End Conformance is green.

After merge/deployment, rerun the same private guitar recording and compare:

- retained/raw event count;
- voice count;
- provisional BPM and alternatives;
- simplified chord-duration groups;
- suppressed display voice-gap rests;
- teacher-reviewed visual readability.
