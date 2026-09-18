#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { runProviderHostedLearnedGuitarEvidence } from '../src/pipeline/providerHostedLearnedGuitarEvidence.js';

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

try {
  const audioPath = requiredEnv('ST_TABCNN_BENCHMARK_AUDIO');
  const basicPitchPath = requiredEnv('ST_TABCNN_BENCHMARK_BASIC_PITCH_JSON');
  requiredEnv('ST_TABCNN_CRISPASR_BIN');
  requiredEnv('ST_TABCNN_MODEL_PATH');
  requiredEnv('ST_TABCNN_MANIFEST_PATH');

  const basicPitchEvents = JSON.parse(await readFile(basicPitchPath, 'utf8'));
  if (!Array.isArray(basicPitchEvents)) {
    throw new Error('ST_TABCNN_BENCHMARK_BASIC_PITCH_JSON must contain an array.');
  }

  const providerScript = fileURLToPath(
    new URL('./provider-hosts/tabcnn-crispasr-provider.mjs', import.meta.url),
  );

  const started = process.hrtime.bigint();
  const result = await runProviderHostedLearnedGuitarEvidence({
    audioPath,
    basicPitchEvents,
    tabCnnHost: {
      command: process.execPath,
      args: [providerScript],
      env: process.env,
    },
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

  const tabCnnHost = result.hostResults.find((entry) => entry.providerId === 'tabcnn');
  if (!tabCnnHost || tabCnnHost.status !== 'READY') {
    throw new Error(`TabCNN provider is not READY: ${tabCnnHost?.reason ?? tabCnnHost?.status ?? 'MISSING'}`);
  }

  const predictions = Array.isArray(tabCnnHost.payload?.predictions)
    ? tabCnnHost.payload.predictions
    : [];
  const diagnostics = result.providerDiagnostics.tabcnn;

  const report = Object.freeze({
    schemaVersion: 's13-2-tabcnn-benchmark-v0.1',
    providerStatus: tabCnnHost.status,
    artifactSha256: diagnostics.artifactSha256,
    elapsedMs,
    rawFrameCount: diagnostics.rawFrameCount,
    predictionCount: diagnostics.predictionCount,
    supportedBasicPitchEventCount: result.shadow.fusion.summary.supportedEventCount,
    unmatchedEvidenceCount: result.shadow.fusion.summary.unmatchedEvidenceCount,
    positionDisagreementEventCount: result.shadow.fusion.summary.positionDisagreementEventCount,
    predictionDigestSha256: digest(predictions),
    authority: result.authority,
  });

  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
  process.stderr.write(`${error?.message ?? error}\n`);
  process.exitCode = 2;
}
