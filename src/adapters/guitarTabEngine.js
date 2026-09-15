export const GUITAR_TAB_HANDOFF_VERSION = '0.2.0';
export const GUITAR_TAB_ENGINE_PINNED_SHA = '1d8ced644f544f7e991f7275eda77a2ce557774e';

function freezeResult(value) {
  return Object.freeze({
    schemaVersion: 'optional-guitar-tab-handoff-v0.2',
    handoffVersion: GUITAR_TAB_HANDOFF_VERSION,
    ...value,
  });
}

function normalizeEngine(engine) {
  if (engine && typeof engine === 'object' && engine.default && typeof engine.default === 'object') {
    return engine.default;
  }
  return engine;
}

function sourcePayload(musicXml) {
  return Object.freeze({
    musicXml,
    preserved: true,
  });
}

function unavailable(code, message, musicXml, details = {}) {
  return freezeResult({
    ok: false,
    status: 'TAB_UNAVAILABLE',
    code,
    message,
    source: sourcePayload(musicXml),
    preflight: details.preflight ?? null,
    canonicalTabResult: details.canonicalTabResult ?? null,
    arrangementArtifact: details.arrangementArtifact ?? null,
    reviewEditableProjection: details.reviewEditableProjection ?? null,
    capabilities: details.capabilities ?? null,
    artifacts: Object.freeze({ json: null, ascii: null, musicXml: null }),
    diagnostics: Object.freeze(details.diagnostics ?? []),
  });
}

function artifactWarning(diagnostics, artifact, error) {
  diagnostics.push(Object.freeze({
    severity: 'warning',
    code: 'TAB_ARTIFACT_SERIALIZATION_FAILED',
    artifact,
    message: error instanceof Error ? error.message : String(error),
  }));
}

function serializeArtifact(engine, functionName, canonicalTabResult, diagnostics) {
  if (typeof engine?.[functionName] !== 'function' || !canonicalTabResult) return null;
  try {
    return engine[functionName](canonicalTabResult);
  } catch (error) {
    artifactWarning(diagnostics, functionName, error);
    return null;
  }
}

function stringifyTabEvidence(value, diagnostics) {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    artifactWarning(diagnostics, 'json', error);
    return null;
  }
}

function handoffThroughApplicationRuntime(engine, sourceMusicXml, options) {
  let runtimeResult;
  try {
    runtimeResult = engine.processMusicXmlUpload({
      fileName: typeof options.fileName === 'string' && options.fileName.length > 0
        ? options.fileName
        : 'improvisation.musicxml',
      bytes: new TextEncoder().encode(sourceMusicXml),
    }, {
      processing: options.processing && typeof options.processing === 'object'
        ? options.processing
        : {},
    });
  } catch (error) {
    return unavailable('GUITAR_TAB_RUNTIME_FAILED', error instanceof Error ? error.message : String(error), sourceMusicXml);
  }

  const preflight = runtimeResult?.preflight ?? null;
  const capabilities = runtimeResult?.capabilities ?? null;
  const canonicalTabResult = runtimeResult?.canonicalTabResult ?? null;
  const arrangementArtifact = runtimeResult?.arrangementArtifact ?? null;
  const reviewEditableProjection = runtimeResult?.reviewEditableProjection ?? null;
  const hasTab = capabilities?.generateTab === true || Boolean(canonicalTabResult) || Boolean(arrangementArtifact);

  if (!hasTab) {
    const firstIssue = Array.isArray(runtimeResult?.issues) && runtimeResult.issues.length > 0
      ? runtimeResult.issues[0]
      : Array.isArray(preflight?.issues) && preflight.issues.length > 0
        ? preflight.issues[0]
        : null;
    return unavailable(
      runtimeResult?.status === 'BLOCKED' ? 'GUITAR_TAB_RUNTIME_BLOCKED' : 'GUITAR_TAB_RESULT_UNAVAILABLE',
      firstIssue?.message ?? 'Guitar TAB runtime produced no TAB artifact; the source score remains usable.',
      sourceMusicXml,
      {
        preflight,
        canonicalTabResult,
        arrangementArtifact,
        reviewEditableProjection,
        capabilities,
        diagnostics: runtimeResult?.issues ?? [],
      },
    );
  }

  const diagnostics = Array.isArray(runtimeResult?.issues) ? [...runtimeResult.issues] : [];
  const tabEvidence = canonicalTabResult ?? arrangementArtifact;
  const artifacts = Object.freeze({
    json: options.includeJson === false ? null : stringifyTabEvidence(tabEvidence, diagnostics),
    ascii: options.includeAscii === false ? null : serializeArtifact(engine, 'serializeCanonicalTabResultToAscii', canonicalTabResult, diagnostics),
    musicXml: options.includeMusicXml === false
      ? null
      : (typeof runtimeResult?.musicXml === 'string' ? runtimeResult.musicXml : null),
  });

  return freezeResult({
    ok: true,
    status: runtimeResult?.status === 'REVIEW_REQUIRED' || runtimeResult?.artifacts?.provisionalTabAvailable === true
      ? 'TAB_REVIEW_REQUIRED'
      : 'TAB_READY',
    code: null,
    message: null,
    source: sourcePayload(sourceMusicXml),
    preflight,
    canonicalTabResult,
    arrangementArtifact,
    reviewEditableProjection,
    capabilities,
    artifacts,
    diagnostics: Object.freeze(diagnostics),
  });
}

function handoffThroughPackageRoot(engine, sourceMusicXml, options) {
  const parser = options.parser && typeof options.parser === 'object' ? options.parser : {};
  const guitar = options.guitar && typeof options.guitar === 'object' ? options.guitar : {};
  const costProfile = options.costProfile && typeof options.costProfile === 'object' ? options.costProfile : {};
  let preflight = null;

  if (typeof engine.preflightMusicXml === 'function') {
    try {
      preflight = engine.preflightMusicXml(sourceMusicXml, parser);
    } catch (error) {
      return unavailable('GUITAR_TAB_PREFLIGHT_FAILED', error instanceof Error ? error.message : String(error), sourceMusicXml);
    }
    if (preflight?.canProcess === false) {
      return unavailable('GUITAR_TAB_PREFLIGHT_BLOCKED', 'TAB engine cannot process this score, but the source score remains usable.', sourceMusicXml, { preflight });
    }
  }

  let conversion;
  try {
    conversion = engine.convertMusicXmlToCanonicalTab(sourceMusicXml, { parser, guitar, costProfile });
  } catch (error) {
    return unavailable('GUITAR_TAB_CONVERSION_FAILED', error instanceof Error ? error.message : String(error), sourceMusicXml, { preflight });
  }

  const effectivePreflight = conversion?.preflight ?? preflight;
  const canonicalTabResult = conversion?.canonicalTabResult ?? null;
  if (!canonicalTabResult) {
    return unavailable(
      effectivePreflight?.canProcess === false ? 'GUITAR_TAB_PREFLIGHT_BLOCKED' : 'GUITAR_TAB_RESULT_UNAVAILABLE',
      'TAB conversion produced no canonical TAB result; the source score remains usable.',
      sourceMusicXml,
      { preflight: effectivePreflight },
    );
  }

  const diagnostics = [];
  const artifacts = Object.freeze({
    json: options.includeJson === false ? null : serializeArtifact(engine, 'serializeCanonicalTabResult', canonicalTabResult, diagnostics),
    ascii: options.includeAscii === false ? null : serializeArtifact(engine, 'serializeCanonicalTabResultToAscii', canonicalTabResult, diagnostics),
    musicXml: options.includeMusicXml === false ? null : serializeArtifact(engine, 'serializeCanonicalTabResultToMusicXml', canonicalTabResult, diagnostics),
  });

  return freezeResult({
    ok: true,
    status: canonicalTabResult.requiresTeacherReview === true ? 'TAB_REVIEW_REQUIRED' : 'TAB_READY',
    code: null,
    message: null,
    source: sourcePayload(sourceMusicXml),
    preflight: effectivePreflight ?? null,
    canonicalTabResult,
    arrangementArtifact: null,
    reviewEditableProjection: null,
    capabilities: null,
    artifacts,
    diagnostics: Object.freeze(diagnostics),
  });
}

export function handoffMusicXmlToOptionalGuitarTab(engineInput, musicXml, options = {}) {
  const engine = normalizeEngine(engineInput);
  const sourceMusicXml = typeof musicXml === 'string' ? musicXml : String(musicXml ?? '');

  if (sourceMusicXml.trim().length === 0) {
    return unavailable('INVALID_SOURCE_MUSICXML', 'A non-empty MusicXML source is required for optional TAB generation.', sourceMusicXml);
  }
  if (!engine || typeof engine !== 'object') {
    return unavailable('GUITAR_TAB_ENGINE_UNAVAILABLE', 'Guitar TAB engine is unavailable; the source score remains usable.', sourceMusicXml);
  }

  if (typeof engine.processMusicXmlUpload === 'function') {
    return handoffThroughApplicationRuntime(engine, sourceMusicXml, options);
  }
  if (typeof engine.convertMusicXmlToCanonicalTab === 'function') {
    return handoffThroughPackageRoot(engine, sourceMusicXml, options);
  }
  return unavailable('GUITAR_TAB_ENGINE_UNAVAILABLE', 'No admitted Guitar TAB conversion surface is available; the source score remains usable.', sourceMusicXml);
}
