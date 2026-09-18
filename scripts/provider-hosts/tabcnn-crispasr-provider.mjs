#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import {
  parseCrispAsrTabJson,
  projectTabCnnFramesToPredictions,
} from '../../src/providers/tabCnnCrispAsr.js';
import {
  validateModelArtifactManifest,
  verifyModelArtifact,
} from '../../src/providers/modelArtifactVerifier.js';

const PROVIDER_VERSION = 'tabcnn-crispasr-provider-v0.2';
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function readRequest() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const request = JSON.parse(input);
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('provider request must be an object.');
  }
  if (request.providerId !== 'tabcnn') {
    throw new Error('providerId must be tabcnn.');
  }
  if (typeof request.audioPath !== 'string' || request.audioPath.length === 0) {
    throw new Error('audioPath is required.');
  }
  return request;
}

function runCrispAsr(command, args) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.on('error', fail);
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > MAX_STDOUT_BYTES) {
        child.kill('SIGKILL');
        fail(new Error('CrispASR output limit exceeded.'));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > MAX_STDOUT_BYTES) {
        stderr = stderr.slice(-MAX_STDOUT_BYTES);
      }
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(new Error(`CrispASR exited with code ${code} signal ${signal ?? 'none'}: ${stderr.slice(-4096)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

try {
  const request = await readRequest();
  const crispAsrBin = requiredEnv('ST_TABCNN_CRISPASR_BIN');
  const modelPath = requiredEnv('ST_TABCNN_MODEL_PATH');
  const manifestPath = requiredEnv('ST_TABCNN_MANIFEST_PATH');

  const manifest = validateModelArtifactManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  const artifact = await verifyModelArtifact({ manifest, artifactPath: modelPath });
  if (artifact.status !== 'VERIFIED') {
    throw new Error(`TabCNN model verification failed: ${artifact.reason ?? artifact.status}`);
  }

  const args = ['--tab', '-m', modelPath, '-f', request.audioPath, '--tab-format', 'json'];
  const stdout = await runCrispAsr(crispAsrBin, args);

  let rawPayload;
  try {
    rawPayload = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`CrispASR returned invalid JSON: ${error?.message ?? error}`);
  }

  const parsed = parseCrispAsrTabJson(rawPayload);
  const predictions = projectTabCnnFramesToPredictions(parsed, {
    openMidiByString: manifest.openMidiByString,
  });

  process.stdout.write(JSON.stringify({
    providerVersion: PROVIDER_VERSION,
    authority: 'SHADOW_EVIDENCE_ONLY',
    artifact: {
      ...artifact,
      providerId: manifest.providerId,
      runtime: manifest.runtime,
      runtimeRepository: manifest.runtimeRepository,
      runtimeCommit: manifest.runtimeCommit,
      modelRepository: manifest.modelRepository,
      modelFilename: manifest.modelFilename,
      license: manifest.license,
      architecture: manifest.architecture,
      tuning: manifest.tuning,
      openMidiByString: manifest.openMidiByString,
    },
    predictions,
    rawFrames: parsed.frames,
    framePeriodSeconds: parsed.framePeriodSeconds,
  }));
} catch (error) {
  process.stderr.write(`${error?.message ?? error}\n`);
  process.exitCode = 2;
}
