export {
  ImprovisationToScoreError,
  createRawPerformanceEvent,
  createTranscriptionContext,
  measureLengthQuarter,
  rational,
  rationalToNumber,
} from './contracts.js';

export {
  finalizeQuantizedPerformance,
  quantizePerformance,
  quantizePerformanceEvent,
  quantizePerformanceEventFromQuarterValues,
  secondsToQuarterNotes,
} from './rhythmQuantizer.js';

export {
  buildScoreDraft,
  buildScoreDraftFromQuantizedEvents,
} from './scoreDraft.js';

export {
  BASIC_PITCH_ADAPTER_VERSION,
  BASIC_PITCH_EXPECTED_PACKAGE_VERSION,
  BASIC_PITCH_MAX_NOTE_EVENTS,
  BASIC_PITCH_PROVIDER_ID,
  BASIC_PITCH_SOURCE_AUTHORITY,
  BASIC_PITCH_SOURCE_TYPE,
  adaptBasicPitchProviderResult,
  buildScoreDraftFromBasicPitchResult,
} from './adapters/basicPitch.js';

export {
  BEAT_TEMPO_ADAPTER_VERSION,
  BEAT_TEMPO_MAX_BEATS,
  BEAT_TEMPO_MAX_CANDIDATES,
  BEAT_TEMPO_SOURCE_AUTHORITY,
  adaptBeatTempoProviderResult,
  buildScoreDraftFromBeatTempoProvider,
} from './adapters/beatTempo.js';

export {
  GUITAR_TAB_ENGINE_PINNED_SHA,
  GUITAR_TAB_HANDOFF_VERSION,
  handoffMusicXmlToOptionalGuitarTab,
} from './adapters/guitarTabEngine.js';

export {
  SCORE_EDITOR_SDK_BRIDGE_VERSION,
  SCORE_EDITOR_SDK_REQUIRED_VERSION,
  exportMusicXmlFromEditor,
  openScoreDraftInEditor,
} from './adapters/scoreEditorSdk.js';

export {
  SCORE_EDITOR_SOURCE_IDENTITY_BRIDGE_VERSION,
  SCORE_EDITOR_SOURCE_NOTE_PREFIX,
  createScoreEditorSourceIdentityManifest,
  openScoreDraftWithSourceIdentityInEditor,
  resolveScoreEditorSourceIdentity,
  serializeScoreDraftForScoreEditor,
} from './adapters/scoreEditorSourceIdentity.js';

export {
  SCORE_EDITOR_TEACHER_EDIT_BRIDGE_VERSION,
  SCORE_EDITOR_TEACHER_EDIT_SDK_VERSION,
  appendScoreEditorTeacherEdit,
  applyScoreEditorTeacherEdit,
  normalizeScoreEditorTeacherEditReceipt,
} from './adapters/scoreEditorTeacherEdit.js';

export {
  SCORE_DRAFT_MUSICXML_MAX_DIVISIONS,
  SCORE_DRAFT_MUSICXML_VERSION,
  createScoreDraftMusicXmlManifest,
  serializeScoreDraftToMusicXml,
} from './export/musicXml.js';

export {
  AUDIO_TO_SCORE_PIPELINE_VERSION,
  runAudioToScorePipeline,
} from './pipeline/audioToScore.js';

export {
  USER_RECORDING_ACCEPTANCE_VERSION,
  runUserRecordingAcceptance,
} from './pipeline/userRecordingAcceptance.js';

export {
  POLYPHONIC_MATERIALIZER_MAX_SEGMENTS,
  POLYPHONIC_MATERIALIZER_VERSION,
  materializePolyphonicScore,
} from './polyphony/materialize.js';

export {
  SONORITY_ANALYZER_VERSION,
  SONORITY_MAX_EVENTS,
  analyzeSonoritySpans,
} from './polyphony/sonority.js';

export {
  VOICE_CANDIDATE_ANALYZER_VERSION,
  VOICE_CANDIDATE_MAX_EVENTS,
  analyzeVoiceCandidates,
} from './polyphony/voiceCandidates.js';

export {
  METER_CANDIDATE_ANALYZER_VERSION,
  METER_CANDIDATE_AUTHORITY,
  METER_CANDIDATE_MAX_BEATS,
  analyzeMeterCandidates,
} from './timing/meterCandidates.js';

export {
  TEMPO_CANDIDATE_ANALYZER_VERSION,
  TEMPO_CANDIDATE_AUTHORITY,
  TEMPO_CANDIDATE_MAX_EVENTS,
  analyzeTempoCandidates,
} from './timing/tempoCandidates.js';

export {
  LOCAL_TEMPO_MAX_BEATS,
  LOCAL_TEMPO_MAX_CHANGES,
  LOCAL_TEMPO_SEGMENT_ANALYZER_VERSION,
  LOCAL_TEMPO_SEGMENT_AUTHORITY,
  analyzeLocalTempoSegments,
  buildScoreDraftFromLocalTempoEvidence,
  createLocalTempoTimingMap,
} from './timing/localTempoSegments.js';

export {
  MEASURE_TOPOLOGY_MAX_MEASURES,
  MEASURE_TOPOLOGY_VERSION,
  buildMeasureTopology,
  describeMeasureTopology,
  measureAtQuarter,
  measureTopologyEndQuarter,
} from './timing/measureTopology.js';

export {
  TIMING_MAP_AUTHORITY,
  TIMING_MAP_MAX_CHANGES,
  TIMING_MAP_VERSION,
  createConstantTimingMapFromContext,
  createTimingMap,
  effectiveMeterAtQuarter,
  effectiveTempoAtQuarter,
  elapsedSecondsToQuarterPosition,
  quarterPositionToElapsedSeconds,
} from './timing/timingMap.js';

export {
  TIMING_MAP_QUANTIZER_VERSION,
  quantizePerformanceWithTimingMap,
  validateTimingMapContextCompatibility,
} from './timing/timingMapQuantizer.js';

export {
  TEACHER_CORRECTION_AUTHORITY,
  TEACHER_CORRECTION_LEDGER_VERSION,
  TEACHER_CORRECTION_MAX_ENTRIES,
  TEACHER_CORRECTION_MAX_VALUE_DEPTH,
  appendTeacherCorrection,
  createTeacherCorrectionLedger,
  revertTeacherCorrection,
  summarizeTeacherCorrections,
  teacherCorrectionCategory,
} from './teacher/correctionLedger.js';

export {
  TEACHER_CALIBRATION_CORE_CATEGORIES,
  TEACHER_CALIBRATION_MAX_OBSERVATIONS,
  TEACHER_CALIBRATION_METRICS_VERSION,
  buildTeacherCalibrationReport,
} from './teacher/calibrationMetrics.js';

export {
  TEACHER_ACCEPTANCE_CORE_CATEGORIES,
  TEACHER_ACCEPTANCE_REPORT_VERSION,
  buildTeacherAcceptanceReport,
} from './teacher/acceptanceReport.js';

export {
  TEACHER_SCORE_OVERLAY_AUTHORITY,
  TEACHER_SCORE_OVERLAY_MAX_APPLIED,
  TEACHER_SCORE_OVERLAY_VERSION,
  applyTeacherCorrectionOverlay,
} from './teacher/scoreOverlay.js';