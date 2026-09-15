export const BASIC_PITCH_AUDIO_SAMPLE_RATE = 22050;

function invalidAudio(message) {
  throw new TypeError(message);
}

export async function prepareAudioForBasicPitch(audioBuffer, options = {}) {
  if (!audioBuffer || typeof audioBuffer !== 'object') {
    invalidAudio('A decoded AudioBuffer is required.');
  }
  if (!Number.isFinite(audioBuffer.sampleRate) || audioBuffer.sampleRate <= 0) {
    invalidAudio('AudioBuffer.sampleRate must be a positive finite number.');
  }
  if (!Number.isInteger(audioBuffer.numberOfChannels) || audioBuffer.numberOfChannels <= 0) {
    invalidAudio('AudioBuffer.numberOfChannels must be a positive integer.');
  }
  if (!Number.isFinite(audioBuffer.duration) || audioBuffer.duration <= 0) {
    invalidAudio('AudioBuffer.duration must be a positive finite number.');
  }

  if (
    audioBuffer.sampleRate === BASIC_PITCH_AUDIO_SAMPLE_RATE &&
    audioBuffer.numberOfChannels === 1
  ) {
    return audioBuffer;
  }

  const scope = options.scope ?? globalThis;
  const OfflineAudioContextClass = options.OfflineAudioContextClass
    ?? scope?.OfflineAudioContext
    ?? scope?.webkitOfflineAudioContext;

  if (typeof OfflineAudioContextClass !== 'function') {
    throw new Error('This browser cannot resample audio for Basic Pitch because OfflineAudioContext is unavailable.');
  }

  const frameCount = Math.max(1, Math.ceil(audioBuffer.duration * BASIC_PITCH_AUDIO_SAMPLE_RATE));
  const offline = new OfflineAudioContextClass(1, frameCount, BASIC_PITCH_AUDIO_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  if (
    !rendered ||
    rendered.sampleRate !== BASIC_PITCH_AUDIO_SAMPLE_RATE ||
    rendered.numberOfChannels !== 1
  ) {
    throw new Error('Audio resampling did not produce the mono 22050 Hz buffer required by Basic Pitch.');
  }
  return rendered;
}
