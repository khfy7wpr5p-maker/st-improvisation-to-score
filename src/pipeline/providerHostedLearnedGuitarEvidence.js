import { runExternalGuitarEvidenceProvider } from '../providers/externalGuitarEvidenceHost.js';
import { buildLearnedGuitarEvidenceShadow } from './learnedGuitarEvidence.js';

export const PROVIDER_HOSTED_LEARNED_GUITAR_EVIDENCE_VERSION = '0.1.0';

function configuredHost(spec, providerId) {
  if (spec == null) return null;
  if (typeof spec !== 'object' || Array.isArray(spec)) throw new TypeError(`${providerId} host must be a plain object.`);
  return { ...spec, providerId };
}

export async function runProviderHostedLearnedGuitarEvidence(input = {}) {
  const basicPitchEvents = Array.isArray(input.basicPitchEvents) ? input.basicPitchEvents : [];
  const audioPath = input.audioPath;
  const hostSpecs = [
    configuredHost(input.tabCnnHost, 'tabcnn'),
    configuredHost(input.fretNetHost, 'fretnet'),
  ].filter(Boolean);

  const hostResults = [];
  for (const host of hostSpecs) {
    hostResults.push(await runExternalGuitarEvidenceProvider({
      ...host,
      audioPath,
      metadata: {
        ...(input.metadata ?? {}),
        requestedAuthority: 'SHADOW_EVIDENCE_ONLY',
      },
    }));
  }

  const tabCnnReady = hostResults.find((result) => result.providerId === 'tabcnn' && result.status === 'READY');
  const fretNetReady = hostResults.find((result) => result.providerId === 'fretnet' && result.status === 'READY');

  const shadow = buildLearnedGuitarEvidenceShadow({
    basicPitchEvents,
    tabCnn: tabCnnReady?.payload ?? null,
    fretNet: fretNetReady?.payload ?? null,
    fusionOptions: input.fusionOptions ?? {},
  });

  return Object.freeze({
    schemaVersion: 'provider-hosted-learned-guitar-evidence-v0.1',
    pipelineVersion: PROVIDER_HOSTED_LEARNED_GUITAR_EVIDENCE_VERSION,
    authority: 'SHADOW_EVIDENCE_ONLY',
    audioPath,
    hostResults: Object.freeze(hostResults),
    shadow,
    summary: Object.freeze({
      configuredProviderCount: hostSpecs.length,
      readyProviderCount: hostResults.filter((result) => result.status === 'READY').length,
      unavailableProviderCount: hostResults.filter((result) => result.status === 'UNAVAILABLE').length,
      failedProviderCount: hostResults.filter((result) => result.status === 'FAILED').length,
      supportedEventCount: shadow.fusion.summary.supportedEventCount,
      multiProviderSupportedEventCount: shadow.fusion.summary.multiProviderSupportedEventCount,
      contourSupportedEventCount: shadow.fusion.summary.contourSupportedEventCount,
    }),
  });
}
