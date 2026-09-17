import { spawn } from 'node:child_process';

export const EXTERNAL_GUITAR_EVIDENCE_HOST_VERSION = '0.1.0';
export const EXTERNAL_GUITAR_EVIDENCE_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function boundedString(value, field, max = 4096) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new TypeError(`${field} must be a non-empty bounded string.`);
  }
  return value;
}

function stringArray(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${field} must be an array of strings.`);
  }
  return [...value];
}

function timeoutMs(value) {
  const normalized = value == null ? 120_000 : Number(value);
  if (!Number.isInteger(normalized) || normalized < 1_000 || normalized > 900_000) {
    throw new RangeError('timeoutMs must be an integer between 1000 and 900000.');
  }
  return normalized;
}

function normalizeEnv(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('env must be a plain object.');
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') throw new TypeError('env values must be strings.');
    result[key] = entry;
  }
  return result;
}

function completed(status, details = {}) {
  return Object.freeze({
    schemaVersion: 'external-guitar-evidence-host-result-v0.1',
    hostVersion: EXTERNAL_GUITAR_EVIDENCE_HOST_VERSION,
    status,
    ...details,
  });
}

export function runExternalGuitarEvidenceProvider(input = {}) {
  const providerId = boundedString(input.providerId, 'providerId', 128);
  const audioPath = boundedString(input.audioPath, 'audioPath');
  const command = boundedString(input.command, 'command');
  const args = stringArray(input.args, 'args');
  const limit = timeoutMs(input.timeoutMs);
  const env = normalizeEnv(input.env);
  const request = Object.freeze({
    schemaVersion: 'external-guitar-evidence-host-request-v0.1',
    providerId,
    audioPath,
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? Object.freeze({ ...input.metadata })
      : Object.freeze({}),
  });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;
    let child;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    try {
      child = spawn(command, args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
        cwd: input.cwd ?? undefined,
      });
    } catch (error) {
      finish(completed('UNAVAILABLE', {
        providerId,
        reason: 'SPAWN_FAILED',
        errorMessage: String(error?.message ?? error),
      }));
      return;
    }

    child.on('error', (error) => {
      finish(completed('UNAVAILABLE', {
        providerId,
        reason: error?.code === 'ENOENT' ? 'EXECUTABLE_NOT_FOUND' : 'SPAWN_ERROR',
        errorMessage: String(error?.message ?? error),
      }));
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > EXTERNAL_GUITAR_EVIDENCE_MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish(completed('FAILED', { providerId, reason: 'OUTPUT_LIMIT_EXCEEDED' }));
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > EXTERNAL_GUITAR_EVIDENCE_MAX_OUTPUT_BYTES) {
        stderr = stderr.slice(-EXTERNAL_GUITAR_EVIDENCE_MAX_OUTPUT_BYTES);
      }
    });

    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(completed('UNAVAILABLE', {
        providerId,
        reason: 'TIMEOUT',
        stderr: stderr.slice(-4096),
      }));
    }, limit);

    child.on('close', (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        finish(completed('UNAVAILABLE', {
          providerId,
          reason: 'NON_ZERO_EXIT',
          exitCode: code,
          signal,
          stderr: stderr.slice(-4096),
        }));
        return;
      }

      let payload;
      try {
        payload = JSON.parse(stdout);
      } catch (error) {
        finish(completed('FAILED', {
          providerId,
          reason: 'INVALID_JSON_OUTPUT',
          errorMessage: String(error?.message ?? error),
          stderr: stderr.slice(-4096),
        }));
        return;
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        finish(completed('FAILED', { providerId, reason: 'INVALID_PROVIDER_PAYLOAD' }));
        return;
      }

      finish(completed('READY', {
        providerId,
        exitCode: code,
        payload: Object.freeze({ ...payload }),
        stderr: stderr.slice(-4096),
      }));
    });

    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}
