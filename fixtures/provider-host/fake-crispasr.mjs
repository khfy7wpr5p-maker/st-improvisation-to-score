#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const modelPath = process.env.ST_EXPECTED_TABCNN_MODEL_PATH;
const audioPath = process.env.ST_EXPECTED_AUDIO_PATH;
const expected = ['--tab', '-m', modelPath, '-f', audioPath, '--tab-format', 'json'];

if (JSON.stringify(args) !== JSON.stringify(expected)) {
  process.stderr.write(`unexpected crispasr args: ${JSON.stringify(args)}\n`);
  process.exit(9);
}

if (process.env.ST_FAKE_CRISPASR_MODE === 'malformed') {
  process.stdout.write('{not-json');
  process.exit(0);
}

const fixtureUrl = new URL('./tabcnn-crispasr-json.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
fixture.file = audioPath;
process.stdout.write(JSON.stringify(fixture));
