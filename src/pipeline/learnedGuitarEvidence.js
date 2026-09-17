import { adaptFretNetShadowEvidence } from '../adapters/fretNetEvidence.js';
import { adaptTabCnnShadowEvidence } from '../adapters/tabCnnEvidence.js';
import { fuseGuitarEvidence } from '../evidence/guitarEvidenceFusion.js';

export const LEARNED_GUITAR_EVIDENCE_PIPELINE_VERSION = '0.1.0';

export function buildLearnedGuitarEvidenceShadow(input = {}) {
  const batches = [];
  if (input.tabCnn != null) batches.push(adaptTabCnnShadowEvidence(input.tabCnn));
  if (input.fretNet != null) batches.push(adaptFretNetShadowEvidence(input.fretNet));
  const fusion = fuseGuitarEvidence(
    input.basicPitchEvents ?? [],
    batches,
    input.fusionOptions ?? {},
  );
  return Object.freeze({
    schemaVersion: 'learned-guitar-evidence-shadow-v0.1',
    pipelineVersion: LEARNED_GUITAR_EVIDENCE_PIPELINE_VERSION,
    authority: 'SHADOW_EVIDENCE_ONLY',
    batches: Object.freeze(batches),
    fusion,
  });
}
