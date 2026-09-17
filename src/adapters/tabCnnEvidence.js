import { createGuitarEvidenceBatch } from '../evidence/guitarEvidence.js';

export const TABCNN_EVIDENCE_ADAPTER_VERSION = '0.1.0';
export const TABCNN_EVIDENCE_PROVIDER_ID = 'tabcnn';

export function adaptTabCnnShadowEvidence(input = {}) {
  const predictions = Array.isArray(input.predictions) ? input.predictions : [];
  return createGuitarEvidenceBatch({
    providerId: TABCNN_EVIDENCE_PROVIDER_ID,
    providerVersion: input.providerVersion ?? null,
    capabilities: ['STRING_FRET_NOTE_EVIDENCE'],
    observations: predictions.map((prediction, index) => ({
      evidenceId: prediction.evidenceId ?? `tabcnn:${index}`,
      onsetSeconds: prediction.onsetSeconds,
      offsetSeconds: prediction.offsetSeconds,
      midiPitch: prediction.midiPitch,
      stringIndex: prediction.stringIndex,
      fret: prediction.fret,
      confidence: prediction.confidence,
      technique: prediction.technique ?? null,
      metadata: {
        sourceShape: 'BRIDGE_NORMALIZED_TABCNN_PREDICTION',
        ...(prediction.metadata ?? {}),
      },
    })),
  });
}
