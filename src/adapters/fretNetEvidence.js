import { createGuitarEvidenceBatch } from '../evidence/guitarEvidence.js';

export const FRETNET_EVIDENCE_ADAPTER_VERSION = '0.1.0';
export const FRETNET_EVIDENCE_PROVIDER_ID = 'fretnet';

export function adaptFretNetShadowEvidence(input = {}) {
  const notes = Array.isArray(input.notes) ? input.notes : [];
  return createGuitarEvidenceBatch({
    providerId: FRETNET_EVIDENCE_PROVIDER_ID,
    providerVersion: input.providerVersion ?? null,
    capabilities: ['STRING_FRET_NOTE_EVIDENCE', 'CONTINUOUS_PITCH_CONTOUR_EVIDENCE'],
    observations: notes.map((note, index) => ({
      evidenceId: note.evidenceId ?? `fretnet:${index}`,
      onsetSeconds: note.onsetSeconds,
      offsetSeconds: note.offsetSeconds,
      midiPitch: note.midiPitch,
      stringIndex: note.stringIndex,
      fret: note.fret,
      confidence: note.confidence,
      pitchContour: note.pitchContour ?? [],
      technique: note.technique ?? null,
      metadata: {
        sourceShape: 'BRIDGE_NORMALIZED_FRETNET_NOTE',
        ...(note.metadata ?? {}),
      },
    })),
  });
}
