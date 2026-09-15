import { runAudioToScorePipeline } from './audioToScore.js';
import { buildTeacherAcceptanceReport } from '../teacher/acceptanceReport.js';

export const USER_RECORDING_ACCEPTANCE_VERSION = '0.1.0';

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError('User recording acceptance request must be an object.');
  }
  if (typeof request.transcriptionProvider !== 'function') {
    throw new TypeError('transcriptionProvider must be a function.');
  }
}

export async function runUserRecordingAcceptance(request) {
  validateRequest(request);

  const pipeline = await runAudioToScorePipeline({
    ...request,
    scoreEditorSdk: request.useScoreEditor === true ? request.scoreEditorSdk : null,
    requestGuitarTab: request.requestGuitarTab === true,
    guitarTabEngine: request.requestGuitarTab === true ? request.guitarTabEngine : null,
  });

  const acceptance = buildTeacherAcceptanceReport({
    sessionId: request.sessionId ?? request.sourceId ?? 'user-recording-session',
    recordingId: request.recordingId ?? request.sourceId ?? 'user-recording',
    fileName: request.fileName ?? pipeline.fileName ?? null,
    audioSha256: request.audioSha256 ?? null,
    instrument: request.instrument ?? null,
    durationSeconds: request.durationSeconds ?? null,
    pipelineResult: pipeline,
    ledger: request.ledger,
    reviewedCounts: request.reviewedCounts,
    observations: request.observations,
    binCount: request.binCount,
    teacherVerdict: request.teacherVerdict,
    teacherNotes: request.teacherNotes,
  });

  return Object.freeze({
    schemaVersion: 'user-recording-acceptance-v0.1',
    version: USER_RECORDING_ACCEPTANCE_VERSION,
    status: pipeline.ok === true ? acceptance.reviewState : pipeline.status,
    pipeline,
    acceptance,
    downstream: Object.freeze({
      scoreEditorRequested: request.useScoreEditor === true,
      scoreEditorUsed: pipeline.editor != null,
      guitarTabRequested: request.requestGuitarTab === true,
      guitarTabUsed: pipeline.guitarTab != null,
    }),
  });
}
