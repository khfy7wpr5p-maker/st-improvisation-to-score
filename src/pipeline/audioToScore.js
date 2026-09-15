import { buildScoreDraftFromBasicPitchResult } from '../adapters/basicPitch.js';
import { handoffMusicXmlToOptionalGuitarTab } from '../adapters/guitarTabEngine.js';
import { openScoreDraftWithSourceIdentityInEditor } from '../adapters/scoreEditorSourceIdentity.js';
import { serializeScoreDraftToMusicXml } from '../export/musicXml.js';

export const AUDIO_TO_SCORE_PIPELINE_VERSION = '0.1.0';

function frozenResult(value) {
  return Object.freeze({
    schemaVersion: 'audio-to-score-pipeline-v0.1',
    pipelineVersion: AUDIO_TO_SCORE_PIPELINE_VERSION,
    ...value,
  });
}

function localFailure(code, message, details = {}) {
  return Object.freeze({ ok: false, code, message, details: Object.freeze({ ...details }) });
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('Audio-to-score request must be an object.');
  }
  if (typeof request.transcriptionProvider !== 'function') {
    throw new TypeError('transcriptionProvider must be a function.');
  }
  if (typeof request.sourceId !== 'string' || request.sourceId.length === 0) {
    throw new TypeError('sourceId is required.');
  }
  if (typeof request.fileName !== 'string' || request.fileName.length === 0) {
    throw new TypeError('fileName is required.');
  }
  if (!request.context || typeof request.context !== 'object' || Array.isArray(request.context)) {
    throw new TypeError('context is required for the current score reconstruction path.');
  }
}

async function invokeProvider(request) {
  try {
    return await request.transcriptionProvider(request.audioInput, {
      ...(request.transcriptionProviderOptions ?? {}),
      sourceId: request.sourceId,
      fileName: request.fileName,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      status: 'PROVIDER_FAILED',
      reason: 'TRANSCRIPTION_PROVIDER_THROWN',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runAudioToScorePipeline(request) {
  validateRequest(request);

  const providerResult = await invokeProvider(request);
  if (!providerResult || providerResult.ok !== true) {
    return frozenResult({
      ok: false,
      status: 'TRANSCRIPTION_UNAVAILABLE',
      code: providerResult?.reason ?? 'TRANSCRIPTION_PROVIDER_FAILED',
      message: providerResult?.message ?? 'Audio transcription provider did not produce usable note evidence.',
      sourceId: request.sourceId,
      fileName: request.fileName,
      providerResult: providerResult ?? null,
      score: null,
      musicXml: null,
      editor: null,
      guitarTab: null,
      capabilities: Object.freeze({
        transcription: false,
        sourceScore: false,
        musicXml: false,
        editor: false,
        guitarTab: false,
      }),
    });
  }

  let score;
  try {
    score = buildScoreDraftFromBasicPitchResult(providerResult, request.context);
  } catch (error) {
    return frozenResult({
      ok: false,
      status: 'SCORE_RECONSTRUCTION_UNAVAILABLE',
      code: error?.code ?? 'SCORE_RECONSTRUCTION_FAILED',
      message: error instanceof Error ? error.message : String(error),
      sourceId: request.sourceId,
      fileName: request.fileName,
      providerResult,
      score: null,
      musicXml: null,
      editor: null,
      guitarTab: null,
      capabilities: Object.freeze({
        transcription: true,
        sourceScore: false,
        musicXml: false,
        editor: false,
        guitarTab: false,
      }),
    });
  }

  let musicXml;
  try {
    musicXml = serializeScoreDraftToMusicXml(score.draft, request.musicXmlOptions ?? {});
  } catch (error) {
    return frozenResult({
      ok: false,
      status: 'SCORE_SERIALIZATION_UNAVAILABLE',
      code: error?.code ?? 'MUSICXML_SERIALIZATION_FAILED',
      message: error instanceof Error ? error.message : String(error),
      sourceId: request.sourceId,
      fileName: request.fileName,
      providerResult,
      score,
      musicXml: null,
      editor: null,
      guitarTab: null,
      capabilities: Object.freeze({
        transcription: true,
        sourceScore: true,
        musicXml: false,
        editor: false,
        guitarTab: false,
      }),
    });
  }

  let editor = null;
  if (request.scoreEditorSdk) {
    editor = await openScoreDraftWithSourceIdentityInEditor(
      request.scoreEditorSdk,
      score.draft,
      request.scoreEditorOptions ?? {},
    );
  }

  let guitarTab = null;
  if (request.guitarTabEngine || request.requestGuitarTab === true) {
    guitarTab = handoffMusicXmlToOptionalGuitarTab(
      request.guitarTabEngine ?? null,
      musicXml,
      request.guitarTabOptions ?? {},
    );
  }

  const scoreReviewRequired = score.status === 'REVIEW_REQUIRED';
  const localDiagnostics = [];
  if (editor && editor.ok !== true) {
    localDiagnostics.push(Object.freeze({
      scope: 'editor',
      code: editor.code ?? 'SCORE_EDITOR_UNAVAILABLE',
      message: editor.message ?? 'Score Editor capability is unavailable.',
    }));
  }
  if (guitarTab && guitarTab.ok !== true) {
    localDiagnostics.push(Object.freeze({
      scope: 'guitar-tab',
      code: guitarTab.code ?? 'GUITAR_TAB_UNAVAILABLE',
      message: guitarTab.message ?? 'Guitar TAB capability is unavailable.',
    }));
  }

  return frozenResult({
    ok: true,
    status: scoreReviewRequired ? 'REVIEW_REQUIRED' : 'PASS',
    code: null,
    message: null,
    sourceId: request.sourceId,
    fileName: request.fileName,
    providerResult,
    score,
    musicXml,
    editor,
    guitarTab,
    diagnostics: Object.freeze(localDiagnostics),
    capabilities: Object.freeze({
      transcription: true,
      sourceScore: true,
      musicXml: true,
      editor: Boolean(editor?.ok),
      guitarTab: Boolean(guitarTab?.ok),
    }),
  });
}
