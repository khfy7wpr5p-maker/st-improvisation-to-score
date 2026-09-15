export {
  ImprovisationToScoreError,
  createRawPerformanceEvent,
  createTranscriptionContext,
  measureLengthQuarter,
  rational,
  rationalToNumber,
} from './contracts.js';

export {
  quantizePerformance,
  quantizePerformanceEvent,
  secondsToQuarterNotes,
} from './rhythmQuantizer.js';

export { buildScoreDraft } from './scoreDraft.js';

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
  SCORE_EDITOR_SDK_BRIDGE_VERSION,
  SCORE_EDITOR_SDK_REQUIRED_VERSION,
  exportMusicXmlFromEditor,
  openScoreDraftInEditor,
} from './adapters/scoreEditorSdk.js';

export {
  SCORE_DRAFT_MUSICXML_MAX_DIVISIONS,
  SCORE_DRAFT_MUSICXML_VERSION,
  createScoreDraftMusicXmlManifest,
  serializeScoreDraftToMusicXml,
} from './export/musicXml.js';

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
  TEMPO_CANDIDATE_ANALYZER_VERSION,
  TEMPO_CANDIDATE_AUTHORITY,
  TEMPO_CANDIDATE_MAX_EVENTS,
  analyzeTempoCandidates,
} from './timing/tempoCandidates.js';
