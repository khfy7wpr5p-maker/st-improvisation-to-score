import { ImprovisationToScoreError } from '../contracts.js';
import {
  createScoreDraftMusicXmlManifest,
  serializeScoreDraftToMusicXml,
} from '../export/musicXml.js';

export const SCORE_EDITOR_SDK_BRIDGE_VERSION = '0.2.0';
export const SCORE_EDITOR_SDK_REQUIRED_VERSION = '1.0.0';

function bridgeFailure(code, message, { musicXml = null, manifest = null, details = {} } = {}) {
  return Object.freeze({
    ok: false,
    schemaVersion: 'score-editor-sdk-bridge-result-v0.1',
    bridgeVersion: SCORE_EDITOR_SDK_BRIDGE_VERSION,
    code,
    message,
    musicXml,
    manifest,
    details: Object.freeze({ ...details }),
  });
}

function bridgeSuccess(value) {
  return Object.freeze({
    ok: true,
    schemaVersion: 'score-editor-sdk-bridge-result-v0.1',
    bridgeVersion: SCORE_EDITOR_SDK_BRIDGE_VERSION,
    ...value,
  });
}

function ensureSdkObject(sdk) {
  return sdk !== null && typeof sdk === 'object' && !Array.isArray(sdk);
}

export async function openScoreDraftInEditor(sdk, draft, options = {}) {
  let musicXml;
  let manifest;
  try {
    musicXml = serializeScoreDraftToMusicXml(draft, options.musicXml ?? options);
    manifest = createScoreDraftMusicXmlManifest(draft);
  } catch (error) {
    const code = error instanceof ImprovisationToScoreError ? error.code : 'MUSICXML_SERIALIZATION_FAILED';
    return bridgeFailure(code, error instanceof Error ? error.message : String(error));
  }

  if (!ensureSdkObject(sdk)) {
    return bridgeFailure('SCORE_EDITOR_SDK_UNAVAILABLE', 'Score Editor SDK is unavailable; MusicXML remains usable independently.', {
      musicXml,
      manifest,
    });
  }
  if (sdk.version !== SCORE_EDITOR_SDK_REQUIRED_VERSION) {
    return bridgeFailure('SCORE_EDITOR_SDK_VERSION_MISMATCH', 'Score Editor SDK version is not the admitted public contract version.', {
      musicXml,
      manifest,
      details: { expected: SCORE_EDITOR_SDK_REQUIRED_VERSION, actual: sdk.version ?? null },
    });
  }
  if (typeof sdk.supports === 'function' && sdk.supports('document') !== true) {
    return bridgeFailure('SCORE_EDITOR_DOCUMENT_CAPABILITY_UNAVAILABLE', 'Score Editor document capability is unavailable; MusicXML remains usable independently.', {
      musicXml,
      manifest,
    });
  }
  if (!sdk.document || typeof sdk.document.openMusicXml !== 'function') {
    return bridgeFailure('SCORE_EDITOR_OPEN_MUSICXML_UNAVAILABLE', 'Score Editor public document.openMusicXml operation is unavailable.', {
      musicXml,
      manifest,
    });
  }

  let openResult;
  try {
    openResult = await sdk.document.openMusicXml(musicXml, {
      ...(options.title ? { title: options.title } : {}),
      ...(options.documentId ? { documentId: options.documentId } : {}),
      ...(options.revisionId ? { revisionId: options.revisionId } : {}),
      ...(typeof options.sha256Hex === 'function' ? { sha256Hex: options.sha256Hex } : {}),
    });
  } catch (error) {
    return bridgeFailure('SCORE_EDITOR_OPEN_MUSICXML_FAILED', error instanceof Error ? error.message : String(error), {
      musicXml,
      manifest,
    });
  }

  if (!openResult || openResult.ok !== true) {
    return bridgeFailure(
      openResult?.error?.code ?? 'SCORE_EDITOR_OPEN_MUSICXML_FAILED',
      openResult?.error?.message ?? 'Score Editor rejected the generated MusicXML.',
      {
        musicXml,
        manifest,
        details: { sdkError: openResult?.error ?? null },
      },
    );
  }

  let revisionGuard = null;
  if (typeof sdk.getRevisionGuard === 'function') {
    try {
      revisionGuard = sdk.getRevisionGuard();
    } catch {
      revisionGuard = null;
    }
  }

  return bridgeSuccess({
    status: 'EDITOR_OPENED',
    sdkVersion: sdk.version,
    musicXml,
    manifest,
    snapshot: openResult.value ?? null,
    revisionGuard,
  });
}

export function exportMusicXmlFromEditor(sdk, expectedRevisionGuard) {
  if (!ensureSdkObject(sdk) || sdk.version !== SCORE_EDITOR_SDK_REQUIRED_VERSION) {
    return bridgeFailure('SCORE_EDITOR_SDK_UNAVAILABLE', 'Compatible Score Editor SDK is required for editor export.');
  }
  if (!sdk.document || typeof sdk.document.exportMusicXml !== 'function') {
    return bridgeFailure('SCORE_EDITOR_EXPORT_MUSICXML_UNAVAILABLE', 'Score Editor public document.exportMusicXml operation is unavailable.');
  }

  try {
    const result = sdk.document.exportMusicXml(expectedRevisionGuard);
    if (!result || result.ok !== true) {
      return bridgeFailure(
        result?.error?.code ?? 'SCORE_EDITOR_EXPORT_MUSICXML_FAILED',
        result?.error?.message ?? 'Score Editor MusicXML export failed.',
        { details: { sdkError: result?.error ?? null } },
      );
    }
    return bridgeSuccess({
      status: 'EDITOR_MUSICXML_EXPORTED',
      sdkVersion: sdk.version,
      musicXml: result.value,
      manifest: null,
      snapshot: null,
      revisionGuard: expectedRevisionGuard ?? null,
    });
  } catch (error) {
    return bridgeFailure('SCORE_EDITOR_EXPORT_MUSICXML_FAILED', error instanceof Error ? error.message : String(error));
  }
}
