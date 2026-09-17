# S13.2 TabCNN Model Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute one real, pinned TabCNN GGUF model through the existing S13.1 provider-host runtime, normalize its string/fret evidence, fuse it with Basic Pitch as shadow evidence, and record a rights-clean real-guitar benchmark without allowing learned evidence to become score authority.

**Architecture:** Keep `runExternalGuitarEvidenceProvider()` as the outer non-blocking process boundary. Add a focused artifact-verification module and a TabCNN/CrispASR provider executable that validates the local GGUF, invokes `crispasr --tab ... --tab-format json` with `shell: false`, preserves raw frame evidence, and projects bounded frame observations into the existing `adaptTabCnnShadowEvidence()` contract. FretNet remains optional/unavailable until its own checkpoint gate is completed.

**Tech Stack:** Node.js >=20, Node built-in `crypto`, `fs`, `child_process`, existing S13/S13.1 evidence pipeline, CrispASR CLI, TabCNN GGUF (`cstr/tabcnn-GGUF`, initial candidate `tabcnn-f16.gguf`).

**Spec:** `docs/superpowers/specs/2026-09-17-s13-2-tabcnn-model-artifact-design.md`

## Global Constraints

- Basic Pitch remains the authoritative note/onset source.
- Learned evidence remains `SHADOW_EVIDENCE_ONLY` throughout S13.2.
- Provider failure or absence must never block Basic Pitch or MusicXML generation.
- Do not silently download or replace model weights during normal score generation.
- The selected TabCNN artifact is `cstr/tabcnn-GGUF` / `tabcnn-f16.gguf`; runtime usage is `crispasr --tab -m <model> -f <audio> --tab-format json`.
- The model emits per-frame, per-string emission scores; it is not a playable TAB decoder.
- Frontend/model metadata must be read from the runtime/model, not guessed in this repository.
- The upstream source artifact recorded in the model card has SHA-256 `1470a308896629352a811082843eb708cbc2f1aa3092757340055ef76a53ed0c`; this is provenance for the converted source bytes, not a substitute for verifying the exact local GGUF bytes.
- The exact local GGUF SHA-256 must be captured once during the explicit artifact-install/provenance step and committed in the model manifest before real inference is accepted as READY.
- No private user audio is uploaded by CI or benchmark automation.
- CI success alone is not evidence of improved musical quality.

---

## File Structure

- Create `config/models/tabcnn-f16.json` — pinned TabCNN artifact identity, licence, source provenance, exact local GGUF SHA-256, and runtime expectations.
- Create `src/providers/modelArtifactVerifier.js` — manifest validation and streaming SHA-256 verification for local artifacts.
- Create `test/modelArtifactVerifier.test.js` — TDD coverage for correct hash, wrong hash, missing file, malformed manifest.
- Create `src/providers/tabCnnCrispAsr.js` — CrispASR JSON validation plus frame-to-shadow-prediction projection while retaining raw frame evidence.
- Create `test/tabCnnCrispAsr.test.js` — deterministic parser/projection tests.
- Create `scripts/provider-hosts/tabcnn-crispasr-provider.mjs` — S13.1 JSON-stdin/JSON-stdout provider executable that verifies artifact then invokes CrispASR.
- Create `fixtures/provider-host/tabcnn-crispasr-json.json` — deterministic CrispASR-style JSON fixture outside Node test discovery.
- Modify `src/pipeline/providerHostedLearnedGuitarEvidence.js` — preserve provider artifact/raw-frame diagnostics in returned shadow result without changing authority.
- Modify `src/index.js` — export public verifier/parser interfaces used by tests and tooling.
- Modify `package.json` — include new modules in `npm run check`.
- Create `scripts/benchmark-tabcnn-provider.mjs` — explicit rights-clean benchmark runner; no auto-download.
- Create `.github/workflows/tabcnn-real-model-benchmark.yml` — manually triggered/conditional real-model benchmark that requires preinstalled runtime/model artifact or a separately approved install step.
- Create `docs/S13_2_TABCNN_REAL_PROVIDER.md` — attribution, install/verify/run instructions, status semantics, and benchmark interpretation.

---

### Task 1: Pin and verify the exact TabCNN model artifact

**Files:**
- Create: `config/models/tabcnn-f16.json`
- Create: `src/providers/modelArtifactVerifier.js`
- Test: `test/modelArtifactVerifier.test.js`
- Modify: `src/index.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateModelArtifactManifest(manifest) -> frozen manifest`
- Produces: `verifyModelArtifact({ manifest, artifactPath }) -> Promise<{status, artifactPath, expectedSha256, actualSha256, reason?}>`
- Consumes later: the provider executable in Task 3 must require `status === 'VERIFIED'` before spawning CrispASR.

- [ ] **Step 1: Explicitly acquire and checksum the candidate artifact outside normal score generation**

Run an explicit install/provenance command in a developer/CI environment with network access:

```bash
mkdir -p .cache/models
curl -L --fail \
  -o .cache/models/tabcnn-f16.gguf \
  https://huggingface.co/cstr/tabcnn-GGUF/resolve/main/tabcnn-f16.gguf
shasum -a 256 .cache/models/tabcnn-f16.gguf
```

Expected: a single 64-hex SHA-256 followed by `.cache/models/tabcnn-f16.gguf`. Record that exact digest in `config/models/tabcnn-f16.json`. Do not continue if the download fails or the hash cannot be computed.

Create the manifest with the exact observed digest and fixed provenance fields:

```json
{
  "schemaVersion": "st-model-artifact-manifest-v0.1",
  "providerId": "tabcnn",
  "runtime": "crispasr",
  "modelRepository": "cstr/tabcnn-GGUF",
  "modelFilename": "tabcnn-f16.gguf",
  "license": "CC-BY-4.0",
  "sourceRecord": "https://zenodo.org/records/11406378",
  "sourceArtifactSha256": "1470a308896629352a811082843eb708cbc2f1aa3092757340055ef76a53ed0c",
  "expectedSha256": "<replace with the exact 64-hex digest printed by shasum before committing>",
  "architecture": "tabcnn",
  "authority": "SHADOW_EVIDENCE_ONLY"
}
```

Before commit, verify that no angle-bracket placeholder remains in the file.

- [ ] **Step 2: Write failing verifier tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyModelArtifact } from '../src/index.js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('verifies exact model bytes against pinned sha256', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'st-tabcnn-'));
  const artifactPath = join(dir, 'model.gguf');
  const bytes = Buffer.from('deterministic-tabcnn-fixture');
  await writeFile(artifactPath, bytes);
  const manifest = {
    schemaVersion: 'st-model-artifact-manifest-v0.1',
    providerId: 'tabcnn',
    runtime: 'crispasr',
    modelRepository: 'cstr/tabcnn-GGUF',
    modelFilename: 'tabcnn-f16.gguf',
    license: 'CC-BY-4.0',
    sourceRecord: 'https://zenodo.org/records/11406378',
    sourceArtifactSha256: '1470a308896629352a811082843eb708cbc2f1aa3092757340055ef76a53ed0c',
    expectedSha256: sha256(bytes),
    architecture: 'tabcnn',
    authority: 'SHADOW_EVIDENCE_ONLY'
  };
  const result = await verifyModelArtifact({ manifest, artifactPath });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.actualSha256, manifest.expectedSha256);
});

test('rejects hash mismatch without throwing score-blocking errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'st-tabcnn-'));
  const artifactPath = join(dir, 'model.gguf');
  await writeFile(artifactPath, Buffer.from('wrong-bytes'));
  const result = await verifyModelArtifact({
    manifest: {
      schemaVersion: 'st-model-artifact-manifest-v0.1',
      providerId: 'tabcnn', runtime: 'crispasr', modelRepository: 'cstr/tabcnn-GGUF',
      modelFilename: 'tabcnn-f16.gguf', license: 'CC-BY-4.0',
      sourceRecord: 'https://zenodo.org/records/11406378',
      sourceArtifactSha256: '1470a308896629352a811082843eb708cbc2f1aa3092757340055ef76a53ed0c',
      expectedSha256: '0'.repeat(64), architecture: 'tabcnn', authority: 'SHADOW_EVIDENCE_ONLY'
    },
    artifactPath
  });
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.reason, 'SHA256_MISMATCH');
});
```

- [ ] **Step 3: Run tests and confirm RED**

Run:

```bash
node --test test/modelArtifactVerifier.test.js
```

Expected: FAIL because `verifyModelArtifact` is not exported/implemented.

- [ ] **Step 4: Implement the minimal verifier**

Implement `src/providers/modelArtifactVerifier.js` with:

```js
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const MODEL_ARTIFACT_VERIFIER_VERSION = '0.1.0';

export function validateModelArtifactManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('model artifact manifest must be a plain object.');
  }
  const required = ['schemaVersion','providerId','runtime','modelRepository','modelFilename','license','sourceRecord','sourceArtifactSha256','expectedSha256','architecture','authority'];
  for (const key of required) {
    if (typeof manifest[key] !== 'string' || manifest[key].length === 0) {
      throw new TypeError(`model artifact manifest ${key} must be a non-empty string.`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.expectedSha256)) {
    throw new TypeError('expectedSha256 must be lowercase 64-hex.');
  }
  if (manifest.authority !== 'SHADOW_EVIDENCE_ONLY') {
    throw new TypeError('model artifact authority must remain SHADOW_EVIDENCE_ONLY.');
  }
  return Object.freeze({ ...manifest });
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function verifyModelArtifact({ manifest, artifactPath }) {
  const pinned = validateModelArtifactManifest(manifest);
  try {
    await access(artifactPath);
  } catch {
    return Object.freeze({ status: 'UNAVAILABLE', reason: 'MODEL_FILE_NOT_FOUND', artifactPath });
  }
  const actualSha256 = await sha256File(artifactPath);
  if (actualSha256 !== pinned.expectedSha256) {
    return Object.freeze({ status: 'REJECTED', reason: 'SHA256_MISMATCH', artifactPath, expectedSha256: pinned.expectedSha256, actualSha256 });
  }
  return Object.freeze({ status: 'VERIFIED', artifactPath, expectedSha256: pinned.expectedSha256, actualSha256 });
}
```

Export the two functions/version from `src/index.js` and add the new file to `npm run check`.

- [ ] **Step 5: Run tests and full syntax check**

```bash
node --test test/modelArtifactVerifier.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add config/models/tabcnn-f16.json src/providers/modelArtifactVerifier.js test/modelArtifactVerifier.test.js src/index.js package.json
git commit -m "feat: verify pinned TabCNN model artifact"
```

---

### Task 2: Parse CrispASR TabCNN JSON and project bounded shadow observations

**Files:**
- Create: `src/providers/tabCnnCrispAsr.js`
- Create: `fixtures/provider-host/tabcnn-crispasr-json.json`
- Test: `test/tabCnnCrispAsr.test.js`
- Modify: `src/index.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `parseCrispAsrTabJson(payload) -> {framePeriodSeconds, nStrings, nClasses, silentClass, frames}`
- Produces: `projectTabCnnFramesToPredictions(parsed) -> predictions[]`
- Output prediction shape must match `adaptTabCnnShadowEvidence()` expectations: `{ onsetSeconds, offsetSeconds, midiPitch, stringIndex, fret, confidence, metadata }`.
- Preserve raw frame/string evidence in `metadata.rawFrame` or a sibling raw-evidence structure returned by the parser.

- [ ] **Step 1: Add a deterministic CrispASR-style JSON fixture**

Create a compact fixture representing two frames and six strings, including `frame_period_sec`, `n_strings`, `n_classes`, `silent_class`, frame times, displayed fret decisions, and displayed-fret log-probabilities. Keep it under `fixtures/`, not `test/`, so `node --test` never executes it as a test module.

- [ ] **Step 2: Write failing parser/projection tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCrispAsrTabJson, projectTabCnnFramesToPredictions } from '../src/index.js';

test('parses six-string TabCNN frame evidence without treating it as decided TAB', async () => {
  const raw = JSON.parse(await readFile(new URL('../fixtures/provider-host/tabcnn-crispasr-json.json', import.meta.url), 'utf8'));
  const parsed = parseCrispAsrTabJson(raw);
  assert.equal(parsed.nStrings, 6);
  assert.ok(parsed.framePeriodSeconds > 0);
  assert.equal(parsed.authority, 'SHADOW_EVIDENCE_ONLY');
});

test('projects non-silent low-E-to-high-E frame decisions into note-like evidence', async () => {
  const raw = JSON.parse(await readFile(new URL('../fixtures/provider-host/tabcnn-crispasr-json.json', import.meta.url), 'utf8'));
  const predictions = projectTabCnnFramesToPredictions(parseCrispAsrTabJson(raw));
  assert.ok(predictions.length > 0);
  assert.ok(predictions.every((p) => Number.isFinite(p.onsetSeconds)));
  assert.ok(predictions.every((p) => Number.isInteger(p.stringIndex) && p.stringIndex >= 0 && p.stringIndex < 6));
  assert.ok(predictions.every((p) => Number.isInteger(p.fret) && p.fret >= 0));
  assert.ok(predictions.every((p) => p.metadata.sourceShape === 'CRISPASR_TABCNN_FRAME_EMISSION'));
});
```

- [ ] **Step 3: Run tests and confirm RED**

```bash
node --test test/tabCnnCrispAsr.test.js
```

Expected: FAIL because parser/projector do not exist.

- [ ] **Step 4: Implement minimal parser/projector**

Use standard-tuning open MIDI values only to convert the provider's low-E-to-high-E string/fret decision into a MIDI pitch for compatibility with the existing fusion contract:

```js
const STANDARD_GUITAR_OPEN_MIDI_LOW_TO_HIGH = Object.freeze([40, 45, 50, 55, 59, 64]);
```

Do not infer playability, voice, chord, or final fingering. Each non-silent frame decision becomes a bounded observation whose duration is exactly one provider frame. Convert log-probability to a bounded confidence only if the provider JSON exposes the displayed-fret score; otherwise set `confidence: null`. Reject malformed dimensions/indices with a parser error so S13.1 can classify the provider result as FAILED rather than fabricate evidence.

- [ ] **Step 5: Run tests and syntax check**

```bash
node --test test/tabCnnCrispAsr.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/providers/tabCnnCrispAsr.js fixtures/provider-host/tabcnn-crispasr-json.json test/tabCnnCrispAsr.test.js src/index.js package.json
git commit -m "feat: normalize CrispASR TabCNN frame evidence"
```

---

### Task 3: Add the real TabCNN provider executable on top of S13.1

**Files:**
- Create: `scripts/provider-hosts/tabcnn-crispasr-provider.mjs`
- Test: `test/tabCnnProviderHost.test.js`
- Modify: `src/pipeline/providerHostedLearnedGuitarEvidence.js`

**Interfaces:**
- Consumes: S13.1 request `{ schemaVersion, providerId, audioPath, metadata }` on stdin.
- Consumes environment/config: `ST_TABCNN_CRISPASR_BIN`, `ST_TABCNN_MODEL_PATH`, `ST_TABCNN_MANIFEST_PATH`.
- Consumes Task 1 verifier and Task 2 parser/projector.
- Produces stdout JSON compatible with `adaptTabCnnShadowEvidence()`: `{ providerVersion, artifact, predictions, rawFrames }`.
- Exit non-zero for provider-local failure; outer S13.1 host converts that into `UNAVAILABLE`/`FAILED` without blocking score generation.

- [ ] **Step 1: Write failing host tests using a fake CrispASR executable**

Create the fake executable outside Node test discovery, for example `fixtures/provider-host/fake-crispasr.mjs`, that prints the deterministic JSON fixture from Task 2. Test the real provider executable through `runExternalGuitarEvidenceProvider()` with temporary verified model bytes and a matching temporary manifest.

Assertions:

```js
assert.equal(result.status, 'READY');
assert.equal(result.providerId, 'tabcnn');
assert.equal(result.payload.artifact.status, 'VERIFIED');
assert.ok(result.payload.predictions.length > 0);
assert.ok(Array.isArray(result.payload.rawFrames));
```

Add separate tests for:
- wrong model hash -> outer result is non-READY and Basic Pitch pipeline remains callable;
- missing `ST_TABCNN_CRISPASR_BIN` -> non-READY;
- malformed CrispASR JSON -> FAILED/non-READY;
- provider command arguments include exactly `--tab -m <model> -f <audio> --tab-format json` and never use shell interpolation.

- [ ] **Step 2: Run the host test and confirm RED**

```bash
node --test test/tabCnnProviderHost.test.js
```

Expected: FAIL because the provider executable does not exist.

- [ ] **Step 3: Implement the provider executable**

The executable must:
1. read exactly one JSON request from stdin;
2. load and validate the committed manifest from `ST_TABCNN_MANIFEST_PATH`;
3. call `verifyModelArtifact()` on `ST_TABCNN_MODEL_PATH`;
4. refuse inference unless verification returns `VERIFIED`;
5. spawn `ST_TABCNN_CRISPASR_BIN` with `shell: false` and args:

```js
['--tab', '-m', modelPath, '-f', request.audioPath, '--tab-format', 'json']
```

6. parse stdout with `parseCrispAsrTabJson()`;
7. project predictions with `projectTabCnnFramesToPredictions()`;
8. emit one JSON object to stdout with artifact provenance and raw frame evidence;
9. write diagnostics only to stderr.

- [ ] **Step 4: Preserve artifact/raw evidence in the hosted pipeline result**

Modify `runProviderHostedLearnedGuitarEvidence()` so that READY provider payload diagnostics remain reachable without changing the existing fusion call. Add a `providerDiagnostics` summary containing artifact hash/status and raw-frame count. Do not copy raw frame arrays into Basic Pitch events or score objects.

- [ ] **Step 5: Run focused and existing S13 tests**

```bash
node --test test/tabCnnProviderHost.test.js test/providerHostedLearnedGuitarEvidence.test.js test/learnedGuitarEvidence.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/provider-hosts/tabcnn-crispasr-provider.mjs fixtures/provider-host/fake-crispasr.mjs test/tabCnnProviderHost.test.js src/pipeline/providerHostedLearnedGuitarEvidence.js
git commit -m "feat: run verified TabCNN through CrispASR provider host"
```

---

### Task 4: Add an explicit rights-clean real-model benchmark

**Files:**
- Create: `scripts/benchmark-tabcnn-provider.mjs`
- Create: `.github/workflows/tabcnn-real-model-benchmark.yml`
- Create: `docs/S13_2_TABCNN_REAL_PROVIDER.md`

**Interfaces:**
- Consumes local/CI-provided paths to: CrispASR executable, verified GGUF model, committed manifest, and rights-clean guitar WAV.
- Produces a JSON benchmark report with runtime/provenance and evidence counts.
- Must not download private audio or claim musical-quality improvement.

- [ ] **Step 1: Write benchmark script contract as a deterministic test first**

Add a test that invokes `scripts/benchmark-tabcnn-provider.mjs` against the fake CrispASR executable and verifies the report schema:

```json
{
  "schemaVersion": "s13-2-tabcnn-benchmark-v0.1",
  "providerStatus": "READY",
  "artifactSha256": "64-hex",
  "elapsedMs": 1,
  "rawFrameCount": 2,
  "predictionCount": 1,
  "supportedBasicPitchEventCount": 1,
  "authority": "SHADOW_EVIDENCE_ONLY"
}
```

Use inequalities for elapsed time; do not assert exact timing.

- [ ] **Step 2: Run and confirm RED**

```bash
node --test test/tabCnnBenchmark.test.js
```

Expected: FAIL because benchmark script/report do not exist.

- [ ] **Step 3: Implement the benchmark runner**

The script must accept explicit CLI args or environment variables for all artifact/runtime/audio paths, call `runProviderHostedLearnedGuitarEvidence()`, and write JSON only. It must never auto-download model weights.

- [ ] **Step 4: Add manual/conditional GitHub workflow**

Create a `workflow_dispatch` benchmark job that runs only when required model/runtime inputs are present through an approved artifact preparation step. It may use a generated rights-clean solo-guitar WAV or a repository-owned fixture; it must never depend on the user's private recording.

The job must record the benchmark JSON as an artifact and fail if:
- model SHA verification fails;
- provider status is not READY;
- output is malformed;
- repeated runs on the same audio/model/runtime tuple produce structurally different predictions.

- [ ] **Step 5: Document install/run/licence behavior**

`docs/S13_2_TABCNN_REAL_PROVIDER.md` must state:
- model: `cstr/tabcnn-GGUF`, `tabcnn-f16.gguf`;
- weights licence: CC BY 4.0;
- source record: `https://zenodo.org/records/11406378`;
- CrispASR CLI invocation used by this project;
- exact committed GGUF SHA-256 from the manifest;
- TabCNN is solo-guitar, frame-level emission evidence, not a decided playable TAB;
- Basic Pitch remains score authority in S13.2;
- FretNet remains unavailable until a separately verified checkpoint exists.

- [ ] **Step 6: Run focused tests**

```bash
node --test test/tabCnnBenchmark.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/benchmark-tabcnn-provider.mjs .github/workflows/tabcnn-real-model-benchmark.yml docs/S13_2_TABCNN_REAL_PROVIDER.md test/tabCnnBenchmark.test.js
git commit -m "test: add real TabCNN provider benchmark gate"
```

---

### Task 5: Final regression, real inference evidence, PR gate, and merge readiness

**Files:**
- Modify only if failures reveal a defect in Task 1-4 files.
- No unrelated refactors.

**Interfaces:**
- Final head must preserve the existing S13.1 public interfaces and `SHADOW_EVIDENCE_ONLY` authority.

- [ ] **Step 1: Run the complete local test suite**

```bash
npm test
npm run check
```

Expected: all tests PASS.

- [ ] **Step 2: Execute one real TabCNN run with verified local artifacts**

Use the explicit provider executable, verified `tabcnn-f16.gguf`, CrispASR binary, and a rights-clean solo-guitar WAV. Capture:
- exact runtime identity/version;
- exact artifact SHA-256;
- provider READY status;
- elapsed time;
- raw frame count;
- projected prediction count;
- Basic Pitch supported-event count;
- unmatched/disagreement counts where available.

Do not use the private user recording for CI evidence.

- [ ] **Step 3: Repeat the exact real run and compare determinism**

Run the same audio/model/runtime tuple twice. Expected: identical frame/prediction structure and values within serialization precision; timing may differ.

- [ ] **Step 4: Open/update implementation PR and wait for all required workflows on final HEAD**

Required green gates:
- CI on Node 20 and 22;
- Score Editor Runtime Conformance;
- Guitar TAB Runtime Conformance;
- Real Audio End-to-End Conformance;
- TabCNN real-model benchmark if the approved runtime/model artifact is available in CI.

- [ ] **Step 5: Verify PR head did not move**

Fetch PR metadata after workflows finish and compare the final `head_sha` to the SHA used by the successful workflow runs.

- [ ] **Step 6: Merge only with expected-head protection**

Use `expected_head_sha=<verified final head>` in the merge call. If any required workflow is missing, failed, cancelled, or attached to an older head, do not merge.

- [ ] **Step 7: Post-merge verification**

Fetch `main` and confirm the merge commit includes the S13.2 implementation. Report separately:
- repository/CI success;
- real TabCNN inference success;
- musical-quality status, which remains unproven until a human reviews a real guitar result.

---

## Self-Review Results

- Spec coverage: artifact provenance/hash, no silent download, real provider host, raw evidence retention, shadow-only authority, non-blocking failures, rights-clean benchmark, integration regression gates, and FretNet deferral are all mapped to tasks.
- Placeholder scan: the only angle-bracket instruction appears inside the manifest creation step and explicitly requires replacement with the observed digest before commit; committed source must contain no placeholder.
- Type consistency: Task 1 verifier output feeds Task 3; Task 2 parser/projector feeds Task 3; Task 3 feeds the existing `runProviderHostedLearnedGuitarEvidence()` path; Task 4 uses that public path rather than a separate inference stack.
