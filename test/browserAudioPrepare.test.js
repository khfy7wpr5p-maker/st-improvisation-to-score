import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASIC_PITCH_AUDIO_SAMPLE_RATE,
  prepareAudioForBasicPitch,
} from '../web/audioPrepare.js';

test('passes through already-normalized mono 22050 Hz audio', async () => {
  const input = {
    sampleRate: BASIC_PITCH_AUDIO_SAMPLE_RATE,
    numberOfChannels: 1,
    duration: 1,
  };

  const result = await prepareAudioForBasicPitch(input, {
    OfflineAudioContextClass: class ShouldNotConstruct {
      constructor() {
        throw new Error('should not construct');
      }
    },
  });

  assert.equal(result, input);
});

test('resamples decoded browser audio to mono 22050 Hz before Basic Pitch', async () => {
  let created = null;

  class FakeOfflineAudioContext {
    constructor(channels, length, sampleRate) {
      this.channels = channels;
      this.length = length;
      this.sampleRate = sampleRate;
      this.destination = { kind: 'destination' };
      this.source = null;
      created = this;
    }

    createBufferSource() {
      this.source = {
        buffer: null,
        connectedTo: null,
        started: false,
        connect: (destination) => {
          this.source.connectedTo = destination;
        },
        start: () => {
          this.source.started = true;
        },
      };
      return this.source;
    }

    async startRendering() {
      return {
        sampleRate: this.sampleRate,
        numberOfChannels: this.channels,
        duration: this.length / this.sampleRate,
      };
    }
  }

  const input = {
    sampleRate: 44100,
    numberOfChannels: 2,
    duration: 1.25,
  };

  const result = await prepareAudioForBasicPitch(input, {
    OfflineAudioContextClass: FakeOfflineAudioContext,
  });

  assert.ok(created);
  assert.equal(created.channels, 1);
  assert.equal(created.sampleRate, BASIC_PITCH_AUDIO_SAMPLE_RATE);
  assert.equal(created.length, Math.ceil(1.25 * BASIC_PITCH_AUDIO_SAMPLE_RATE));
  assert.equal(created.source.buffer, input);
  assert.equal(created.source.connectedTo, created.destination);
  assert.equal(created.source.started, true);
  assert.equal(result.sampleRate, BASIC_PITCH_AUDIO_SAMPLE_RATE);
  assert.equal(result.numberOfChannels, 1);
});

test('fails clearly when browser resampling is unavailable', async () => {
  await assert.rejects(
    prepareAudioForBasicPitch({
      sampleRate: 48000,
      numberOfChannels: 2,
      duration: 2,
    }, { scope: {} }),
    /OfflineAudioContext is unavailable/,
  );
});
