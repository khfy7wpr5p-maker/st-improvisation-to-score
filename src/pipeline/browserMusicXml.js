import { adaptBrowserBasicPitchNoteEvents } from '../adapters/basicPitchBrowser.js';
import { buildScoreDraft } from '../scoreDraft.js';
import { analyzeTempoCandidates } from '../timing/tempoCandidates.js';
import { serializeScoreDraftToMusicXml } from '../export/musicXml.js';

export const BROWSER_MUSICXML_PIPELINE_VERSION = '0.1.0';

function finiteBpm(value) {
  if (value == null || value === '') return null;
  const bpm = Number(value);
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 400) throw new RangeError('bpm must be between 20 and 400.');
  return bpm;
}

function positiveInteger(value, fallback, allowed = null) {
  const number = value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number <= 0 || (allowed && !allowed.includes(number))) {
    throw new RangeError('Invalid browser MusicXML timing option.');
  }
  return number;
}

function warning(code, message, details = {}) {
  return Object.freeze({ code, message, details: Object.freeze({ ...details }) });
}

export function buildBrowserMusicXmlFromBasicPitch(input = {}) {
  const batch = adaptBrowserBasicPitchNoteEvents(input.noteEvents ?? [], {
    audioFileName: input.audioFileName ?? null,
    audioSha256: input.audioSha256 ?? null,
    modelUrl: input.modelUrl ?? null,
  });

  const tempo = analyzeTempoCandidates(batch.rawEvents, {
    smallestNoteDenominator: input.smallestNoteDenominator ?? 16,
    allowTriplets: input.allowTriplets !== false,
  });

  const requestedBpm = finiteBpm(input.bpm);
  const fallbackBpm = tempo.recommendedBpmHint ?? 120;
  const bpm = requestedBpm ?? fallbackBpm;
  const meterNumerator = positiveInteger(input.meterNumerator, 4);
  const meterDenominator = positiveInteger(input.meterDenominator, 4, [2, 4, 8, 16]);
  const smallestNoteDenominator = positiveInteger(input.smallestNoteDenominator, 16, [8, 16, 32]);

  const context = Object.freeze({
    bpm,
    meterNumerator,
    meterDenominator,
    smallestNoteDenominator,
    allowTriplets: input.allowTriplets !== false,
  });

  const score = buildScoreDraft(batch.rawEvents, context);
  const musicXml = serializeScoreDraftToMusicXml(score.draft ?? score, input.musicXmlOptions ?? {});
  const diagnostics = [...batch.diagnostics, ...(score.diagnostics ?? [])];

  if (requestedBpm == null && tempo.recommendedBpmHint == null) {
    diagnostics.push(warning(
      'BROWSER_AUTO_TEMPO_FALLBACK',
      'Tempo evidence was insufficient; a provisional 120 BPM grid was used so MusicXML remains available.',
      { bpm },
    ));
  } else if (requestedBpm == null && tempo.guidanceRequired) {
    diagnostics.push(warning(
      'BROWSER_AUTO_TEMPO_REQUIRES_REVIEW',
      'The strongest tempo candidate was used provisionally, but timing evidence remains ambiguous or low-confidence.',
      { bpm, confidence: tempo.confidence, rivalBpms: tempo.ambiguity?.rivalBpms ?? [] },
    ));
  }

  if (input.meterNumerator == null || input.meterDenominator == null) {
    diagnostics.push(warning(
      'BROWSER_DEFAULT_METER_REQUIRES_REVIEW',
      'The browser MVP used a provisional 4/4 meter because no explicit meter was supplied.',
      { meterNumerator, meterDenominator },
    ));
  }

  const voiceCount = score.draft?.polyphonicProjection?.voiceCount
    ?? score.polyphonicProjection?.voiceCount
    ?? null;

  return Object.freeze({
    schemaVersion: 'browser-musicxml-result-v0.1',
    pipelineVersion: BROWSER_MUSICXML_PIPELINE_VERSION,
    ok: true,
    status: diagnostics.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
    transcription: batch,
    tempo,
    context,
    score,
    musicXml,
    summary: Object.freeze({
      detectedEventCount: batch.rawEvents.length,
      voiceCount,
      bpm,
      bpmSource: requestedBpm == null ? 'AUTO_PROVISIONAL' : 'USER',
      meter: `${meterNumerator}/${meterDenominator}`,
    }),
    diagnostics: Object.freeze(diagnostics),
  });
}
