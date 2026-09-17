let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);

if (request.providerId === 'tabcnn') {
  process.stdout.write(JSON.stringify({
    providerVersion: 'fixture-tabcnn-1',
    predictions: [
      {
        onsetSeconds: 0,
        offsetSeconds: 0.5,
        midiPitch: 64,
        stringIndex: 1,
        fret: 0,
        confidence: 0.91
      }
    ]
  }));
} else if (request.providerId === 'fretnet') {
  process.stdout.write(JSON.stringify({
    providerVersion: 'fixture-fretnet-1',
    notes: [
      {
        onsetSeconds: 0.01,
        offsetSeconds: 0.51,
        midiPitch: 64,
        stringIndex: 1,
        fret: 0,
        confidence: 0.88,
        pitchContour: [
          { timeSeconds: 0.1, midiPitchFloat: 64.03 },
          { timeSeconds: 0.2, midiPitchFloat: 64.01 }
        ]
      }
    ]
  }));
} else {
  process.stderr.write('unsupported provider');
  process.exit(2);
}
