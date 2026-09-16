import { adaptBrowserBasicPitchNoteEvents } from '../adapters/basicPitchBrowser.js';
import { serializeScoreDraftToMusicXml } from '../export/musicXml.js';
import {
  cleanGuitarPerformanceEvents,
  reconstructGuitarDurations,
} from '../reconstruction/guitarCleanup.js';
import { refineGuitarDurationsForVoicePressure } from '../reconstruction/guitarRefinement.js';
import { simplifyGuitarNotationDurations } from '../reconstruction/notationSimplification.js';
import { buildScoreDraft } from '../scoreDraft.js';
import { analyzeTempoCandidates } from '../timing/tempoCandidates.js';

export const BROWSER_MUSICXML_PIPELINE_VERSION = '0.4.0';

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

function provisionalAutoBpm(tempo) {
  const top = tempo.recommendedBpmHint ?? null;
  if (top === null) {
    return Object.freeze({
      bpm: 120,
      decision: 'INSUFFICIENT_EVIDENCE_FALLBACK',
      alternatives: Object.freeze([]),
    });
  }

  const rivals = tempo.ambiguity?.halfDouble === true
    ? (tempo.ambiguity?.rivalBpms ?? []).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const forceHighTempoHalf = top >= 180;
  const lowConfidenceHighTempoHalf = top >= 140 && tempo.confidence < 0.8;
  const halfTempo = forceHighTempoHalf || lowConfidenceHighTempoHalf
    ? Number((top / 2).toFixed(3))
    : null;
  const alternatives = [...new Set([
    top,
    ...rivals,
    ...(halfTempo !== null ? [halfTempo] : []),
  ])].sort((a, b) => a - b);

  if (halfTempo !== null) {
    let decision = 'LOW_CONFIDENCE_HIGH_TEMPO_HALF_PROVISIONAL';
    if (tempo.ambiguity?.halfDouble === true) decision = 'HALF_DOUBLE_LOWER_PROVISIONAL';
    else if (forceHighTempoHalf) decision = 'HIGH_TEMPO_HALF_FAMILY_PROVISIONAL';
    return Object.freeze({
      bpm: halfTempo,
      decision,
      alternatives: Object.freeze(alternatives),
    });
  }

  if (alternatives.length > 1) {
    return Object.freeze({
      bpm: alternatives[0],
      decision: 'HALF_DOUBLE_LOWER_PROVISIONAL',
      alternatives: Object.freeze(alternatives),
    });
  }

  return Object.freeze({
    bpm: top,
    decision: tempo.guidanceRequired ? 'TOP_CANDIDATE_PROVISIONAL' : 'TOP_CANDIDATE',
    alternatives: Object.freeze([top]),
  });
}

function groupDiagnostics(items, maxExamples = 3) {
  const groups = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object' || !item.code || !item.message) continue;
    const key = `${item.code}\n${item.message}`;
    const current = groups.get(key) ?? {
      code: item.code,
      message: item.message,
      count: 0,
      examples: [],
      firstDetails: item.details ?? {},
    };
    current.count += 1;
    if (current.examples.length < maxExamples) current.examples.push(item.details ?? {});
    groups.set(key, current);
  }

  return Object.freeze([...groups.values()].map((group) => Object.freeze({
    code: group.code,
    message: group.count > 1 ? `${group.message} (${group.count} occurrences)` : group.message,
    details: Object.freeze({
      ...group.firstDetails,
      groupedCount: group.count,
      examples: Object.freeze(group.examples.map((example) => Object.freeze({ ...example }))),
    }),
  })));
}

function suppressVoiceGapRestsForDisplay(score) {
  const projection = score.polyphonicProjection;
  if (!projection || !Array.isArray(projection.voices)) {
    return Object.freeze({ score, suppressedRestCount: 0 });
  }

  let suppressedRestCount = 0;
  const voices = projection.voices.map((voice) => Object.freeze({
    ...voice,
    measures: Object.freeze(voice.measures.map((measure) => {
      suppressedRestCount += measure.rests?.length ?? 0;
      return Object.freeze({ ...measure, rests: Object.freeze([]) });
    })),
  }));

  const displayProjection = Object.freeze({
    ...projection,
    restCount: 0,
    displaySuppressedRestCount: suppressedRestCount,
    voices: Object.freeze(voices),
  });

  return Object.freeze({
    suppressedRestCount,
    score: Object.freeze({ ...score, polyphonicProjection: displayProjection }),
  });
}

export function buildBrowserMusicXmlFromBasicPitch(input = {}) {
  const batch = adaptBrowserBasicPitchNoteEvents(input.noteEvents ?? [], {
    audioFileName: input.audioFileName ?? null,
    audioSha256: input.audioSha256 ?? null,
    modelUrl: input.modelUrl ?? null,
  });

  const cleanup = cleanGuitarPerformanceEvents(batch.rawEvents, input.guitarCleanupOptions ?? {});
  const cleanupFallbackToRaw = cleanup.cleanedEvents.length === 0 && batch.rawEvents.length > 0;
  const tempoEvents = cleanupFallbackToRaw ? batch.rawEvents : cleanup.cleanedEvents;

  const tempo = analyzeTempoCandidates(tempoEvents, {
    smallestNoteDenominator: input.smallestNoteDenominator ?? 16,
    allowTriplets: input.allowTriplets !== false,
  });

  const requestedBpm = finiteBpm(input.bpm);
  const autoTempoDecision = provisionalAutoBpm(tempo);
  const bpm = requestedBpm ?? autoTempoDecision.bpm;
  const meterNumerator = positiveInteger(input.meterNumerator, 4);
  const meterDenominator = positiveInteger(input.meterDenominator, 4, [2, 4, 8, 16]);
  const smallestNoteDenominator = positiveInteger(input.smallestNoteDenominator, 16, [8, 16, 32]);

  const durationReconstruction = reconstructGuitarDurations(tempoEvents, {
    bpm,
    smallestNoteDenominator,
    allowTriplets: input.allowTriplets !== false,
    maxChordSustainGapSeconds: input.guitarCleanupOptions?.maxChordSustainGapSeconds,
  });

  const voicePressureRefinement = refineGuitarDurationsForVoicePressure(
    durationReconstruction.reconstructedEvents,
    input.guitarRefinementOptions ?? {},
  );

  const notationSimplification = simplifyGuitarNotationDurations(
    voicePressureRefinement.refinedEvents,
    { ...(input.notationSimplificationOptions ?? {}), bpm },
  );

  const context = Object.freeze({
    bpm,
    meterNumerator,
    meterDenominator,
    smallestNoteDenominator,
    allowTriplets: input.allowTriplets !== false,
  });

  const analysisScore = buildScoreDraft(notationSimplification.simplifiedEvents, context);
  const displayProjection = suppressVoiceGapRestsForDisplay(analysisScore);
  const score = displayProjection.score;
  const musicXml = serializeScoreDraftToMusicXml(score, input.musicXmlOptions ?? {});
  const rawDiagnostics = [
    ...batch.diagnostics,
    ...cleanup.diagnostics,
    ...tempo.warnings,
    ...durationReconstruction.diagnostics,
    ...voicePressureRefinement.diagnostics,
    ...notationSimplification.diagnostics,
    ...(analysisScore.diagnostics ?? []),
    ...(analysisScore.warnings ?? []),
  ];

  if (displayProjection.suppressedRestCount > 0) {
    rawDiagnostics.push(warning(
      'BROWSER_VOICE_GAP_RESTS_HIDDEN_IN_DISPLAY_XML',
      'Voice-gap rests were replaced by non-printing time movement in the browser MusicXML display view to reduce visual clutter; the analysis score remains available.',
      { suppressedRestCount: displayProjection.suppressedRestCount },
    ));
  }

  if (cleanupFallbackToRaw) {
    rawDiagnostics.push(warning(
      'GUITAR_CLEANUP_EMPTY_VIEW_FALLBACK',
      'Guitar cleanup retained no events, so immutable raw Basic Pitch events were used provisionally instead of blocking MusicXML.',
      { rawEventCount: batch.rawEvents.length },
    ));
  }

  if (requestedBpm == null && tempo.recommendedBpmHint == null) {
    rawDiagnostics.push(warning(
      'BROWSER_AUTO_TEMPO_FALLBACK',
      'Tempo evidence was insufficient; a provisional 120 BPM grid was used so MusicXML remains available.',
      { bpm },
    ));
  } else if (
    requestedBpm == null &&
    ['HIGH_TEMPO_HALF_FAMILY_PROVISIONAL', 'LOW_CONFIDENCE_HIGH_TEMPO_HALF_PROVISIONAL'].includes(autoTempoDecision.decision)
  ) {
    rawDiagnostics.push(warning(
      'BROWSER_HIGH_TEMPO_HALF_FAMILY_REQUIRES_REVIEW',
      'A high or low-confidence automatic tempo has a plausible half-tempo interpretation; the lower family member is used provisionally for a simpler notation grid while both remain visible for review.',
      {
        bpm,
        recommendedBpmHint: tempo.recommendedBpmHint,
        confidence: tempo.confidence,
        alternatives: autoTempoDecision.alternatives,
      },
    ));
  } else if (requestedBpm == null && tempo.ambiguity?.halfDouble === true) {
    rawDiagnostics.push(warning(
      'BROWSER_AUTO_TEMPO_HALF_DOUBLE_PROVISIONAL',
      'Half/double tempo candidates remain plausible; the lower rival is used provisionally and all candidates remain visible for review.',
      {
        bpm,
        recommendedBpmHint: tempo.recommendedBpmHint,
        alternatives: autoTempoDecision.alternatives,
      },
    ));
  } else if (requestedBpm == null && tempo.guidanceRequired) {
    rawDiagnostics.push(warning(
      'BROWSER_AUTO_TEMPO_REQUIRES_REVIEW',
      'The strongest tempo candidate was used provisionally, but timing evidence remains ambiguous or low-confidence.',
      { bpm, confidence: tempo.confidence, rivalBpms: tempo.ambiguity?.rivalBpms ?? [] },
    ));
  }

  if (input.meterNumerator == null || input.meterDenominator == null) {
    rawDiagnostics.push(warning(
      'BROWSER_DEFAULT_METER_REQUIRES_REVIEW',
      'The browser MVP used a provisional 4/4 meter because no explicit meter was supplied.',
      { meterNumerator, meterDenominator },
    ));
  }

  const diagnostics = groupDiagnostics(rawDiagnostics);

  return Object.freeze({
    schemaVersion: 'browser-musicxml-result-v0.4',
    pipelineVersion: BROWSER_MUSICXML_PIPELINE_VERSION,
    ok: true,
    status: diagnostics.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
    transcription: batch,
    guitarCleanup: cleanup,
    durationReconstruction,
    voicePressureRefinement,
    notationSimplification,
    analysisScore,
    tempo,
    tempoDecision: Object.freeze({
      requestedBpm,
      provisionalBpm: bpm,
      decision: requestedBpm === null ? autoTempoDecision.decision : 'USER_SUPPLIED',
      alternatives: requestedBpm === null ? autoTempoDecision.alternatives : Object.freeze([requestedBpm]),
    }),
    context,
    score,
    musicXml,
    summary: Object.freeze({
      detectedEventCount: batch.rawEvents.length,
      retainedEventCount: cleanupFallbackToRaw ? batch.rawEvents.length : cleanup.cleanedEvents.length,
      suppressedEventCount: cleanupFallbackToRaw ? 0 : cleanup.suppressedEventCount,
      attackGroupCount: cleanup.attackGroups.length,
      resonanceCappedEventCount: voicePressureRefinement.cappedEventCount,
      notationAdjustedEventCount: notationSimplification.adjustedEventCount,
      notationSimplifiedGroupCount: notationSimplification.simplifiedGroupCount,
      suppressedVoiceGapRestCount: displayProjection.suppressedRestCount,
      voiceCount: analysisScore.polyphonicProjection?.voiceCount ?? null,
      bpm,
      bpmSource: requestedBpm == null ? 'AUTO_PROVISIONAL' : 'USER',
      tempoDecision: requestedBpm == null ? autoTempoDecision.decision : 'USER_SUPPLIED',
      tempoAlternatives: requestedBpm == null ? autoTempoDecision.alternatives : Object.freeze([requestedBpm]),
      meter: `${meterNumerator}/${meterDenominator}`,
      admissionProfile: input.admissionProfile ?? null,
    }),
    diagnostics,
  });
}
