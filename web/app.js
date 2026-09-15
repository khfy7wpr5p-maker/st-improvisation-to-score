import {
  BasicPitch,
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
} from 'https://esm.sh/@spotify/basic-pitch@1.0.1';

import { buildBrowserMusicXmlFromBasicPitch } from '../src/index.js';

const MODEL_URL = 'https://unpkg.com/@spotify/basic-pitch@1.0.1/model/model.json';

const $ = (id) => document.getElementById(id);
const audioInput = $('audioInput');
const dropZone = $('dropZone');
const fileCard = $('fileCard');
const fileName = $('fileName');
const fileMeta = $('fileMeta');
const audioPreview = $('audioPreview');
const resetButton = $('resetButton');
const convertButton = $('convertButton');
const convertButtonLabel = $('convertButtonLabel');
const tempoMode = $('tempoMode');
const bpmField = $('bpmField');
const bpmInput = $('bpmInput');
const meterSelect = $('meterSelect');
const resolutionSelect = $('resolutionSelect');
const tripletInput = $('tripletInput');
const progressPanel = $('progressPanel');
const progressTitle = $('progressTitle');
const progressPercent = $('progressPercent');
const progressBar = $('progressBar');
const progressDetail = $('progressDetail');
const resultPanel = $('resultPanel');
const statusBadge = $('statusBadge');
const noteCount = $('noteCount');
const voiceCount = $('voiceCount');
const tempoResult = $('tempoResult');
const meterResult = $('meterResult');
const warningsBox = $('warningsBox');
const warningsList = $('warningsList');
const downloadButton = $('downloadButton');
const newFileButton = $('newFileButton');
const errorPanel = $('errorPanel');
const errorMessage = $('errorMessage');

let selectedFile = null;
let selectedFileUrl = null;
let outputUrl = null;
let outputFileName = null;
let audioDuration = null;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'Süre okunuyor…';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function setProgress(percent, title, detail) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  progressPanel.hidden = false;
  progressBar.style.width = `${safe}%`;
  progressPercent.textContent = `${safe}%`;
  progressTitle.textContent = title;
  progressDetail.textContent = detail;
}

function clearOutput() {
  resultPanel.hidden = true;
  errorPanel.hidden = true;
  progressPanel.hidden = true;
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  outputFileName = null;
}

function reset() {
  selectedFile = null;
  audioDuration = null;
  audioInput.value = '';
  fileCard.hidden = true;
  dropZone.hidden = false;
  resetButton.hidden = true;
  convertButton.disabled = true;
  convertButtonLabel.textContent = 'Notaya dönüştür';
  if (selectedFileUrl) URL.revokeObjectURL(selectedFileUrl);
  selectedFileUrl = null;
  audioPreview.removeAttribute('src');
  clearOutput();
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function sanitizeStem(name) {
  const stem = name.replace(/\.[^.]+$/, '').trim() || 'transcription';
  return stem.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'transcription';
}

function setFile(file) {
  if (!file) return;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['wav', 'mp3', 'ogg', 'flac'].includes(extension)) {
    errorPanel.hidden = false;
    errorMessage.textContent = 'Bu MVP için WAV, MP3, OGG veya FLAC dosyası seçin.';
    return;
  }

  clearOutput();
  selectedFile = file;
  audioDuration = null;
  if (selectedFileUrl) URL.revokeObjectURL(selectedFileUrl);
  selectedFileUrl = URL.createObjectURL(file);
  audioPreview.src = selectedFileUrl;
  fileName.textContent = file.name;
  fileMeta.textContent = `${formatBytes(file.size)} · Süre okunuyor…`;
  fileCard.hidden = false;
  dropZone.hidden = true;
  resetButton.hidden = false;
  convertButton.disabled = false;

  audioPreview.onloadedmetadata = () => {
    audioDuration = audioPreview.duration;
    const longWarning = audioDuration > 300 ? ' · Uzun kayıt: cihazda işlem süresi artabilir' : '';
    fileMeta.textContent = `${formatBytes(file.size)} · ${formatDuration(audioDuration)}${longWarning}`;
  };
}

async function decodeAudio(arrayBuffer) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Bu tarayıcı Web Audio API desteği sağlamıyor.');
  const context = new AudioContextClass();
  try {
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await context.close().catch(() => {});
  }
}

async function transcribe(audioBuffer) {
  const frames = [];
  const onsets = [];
  const contours = [];
  const basicPitch = new BasicPitch(MODEL_URL);

  setProgress(12, 'Basic Pitch hazırlanıyor', 'Model tarayıcıya yükleniyor. Ses dosyanız yüklenmiyor.');
  await basicPitch.evaluateModel(
    audioBuffer,
    (frameChunk, onsetChunk, contourChunk) => {
      frames.push(...frameChunk);
      onsets.push(...onsetChunk);
      contours.push(...contourChunk);
    },
    (progress) => {
      const normalized = Number(progress);
      const ratio = normalized > 1 ? normalized / 100 : normalized;
      setProgress(15 + ratio * 58, 'Ses analiz ediliyor', 'Polifonik nota olayları çıkarılıyor.');
    },
  );

  setProgress(76, 'Notalar çözümleniyor', 'Pitch, başlangıç ve süre olayları hazırlanıyor.');
  const frameNotes = outputToNotesPoly(frames, onsets, 0.3, 0.2, 5);
  return noteFramesToTime(addPitchBendsToNoteEvents(contours, frameNotes));
}

function renderWarnings(diagnostics) {
  warningsList.innerHTML = '';
  const useful = diagnostics.filter((item) => item?.message);
  warningsBox.hidden = useful.length === 0;
  for (const item of useful) {
    const li = document.createElement('li');
    li.textContent = item.message;
    warningsList.appendChild(li);
  }
}

function renderResult(result) {
  const blob = new Blob([result.musicXml], { type: 'application/vnd.recordare.musicxml+xml;charset=utf-8' });
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = URL.createObjectURL(blob);
  outputFileName = `${sanitizeStem(selectedFile.name)}.musicxml`;

  noteCount.textContent = String(result.summary.detectedEventCount ?? '—');
  voiceCount.textContent = result.summary.voiceCount == null ? '—' : String(result.summary.voiceCount);
  tempoResult.textContent = `${Number(result.summary.bpm).toFixed(1).replace('.0', '')} BPM`;
  meterResult.textContent = result.summary.meter;
  statusBadge.textContent = result.status === 'PASS' ? 'PASS' : 'REVIEW';
  statusBadge.className = `status-badge ${result.status === 'PASS' ? 'pass' : 'review'}`;
  renderWarnings(result.diagnostics ?? []);
  resultPanel.hidden = false;
  errorPanel.hidden = true;
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function convert() {
  if (!selectedFile) return;
  clearOutput();
  convertButton.disabled = true;
  convertButtonLabel.textContent = 'Dönüştürülüyor…';

  try {
    setProgress(3, 'Dosya okunuyor', 'Ses verisi ve kaynak özeti hazırlanıyor.');
    const fileBuffer = await selectedFile.arrayBuffer();
    const [audioSha256, audioBuffer] = await Promise.all([
      sha256Hex(fileBuffer),
      decodeAudio(fileBuffer),
    ]);

    const noteEvents = await transcribe(audioBuffer);
    if (noteEvents.length === 0) throw new Error('Basic Pitch bu kayıtta kullanılabilir nota olayı bulamadı.');

    setProgress(84, 'Ritim ve polifoni kuruluyor', 'ST reconstruction engine MusicXML taslağını hazırlıyor.');
    const [meterNumerator, meterDenominator] = meterSelect.value.split('/').map(Number);
    const result = buildBrowserMusicXmlFromBasicPitch({
      noteEvents,
      audioFileName: selectedFile.name,
      audioSha256,
      modelUrl: MODEL_URL,
      bpm: tempoMode.value === 'manual' ? Number(bpmInput.value) : null,
      meterNumerator,
      meterDenominator,
      smallestNoteDenominator: Number(resolutionSelect.value),
      allowTriplets: tripletInput.checked,
      musicXmlOptions: { partName: sanitizeStem(selectedFile.name) },
    });

    setProgress(100, 'MusicXML hazır', 'Dosya cihazınızda üretildi.');
    renderResult(result);
  } catch (error) {
    progressPanel.hidden = true;
    errorPanel.hidden = false;
    errorMessage.textContent = error instanceof Error ? error.message : String(error);
    errorPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    convertButton.disabled = false;
    convertButtonLabel.textContent = 'Notaya dönüştür';
  }
}

audioInput.addEventListener('change', () => setFile(audioInput.files?.[0]));
resetButton.addEventListener('click', reset);
newFileButton.addEventListener('click', reset);
convertButton.addEventListener('click', convert);
tempoMode.addEventListener('change', () => {
  bpmField.hidden = tempoMode.value !== 'manual';
});

downloadButton.addEventListener('click', () => {
  if (!outputUrl || !outputFileName) return;
  const anchor = document.createElement('a');
  anchor.href = outputUrl;
  anchor.download = outputFileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
});

for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
  });
}
dropZone.addEventListener('drop', (event) => setFile(event.dataTransfer?.files?.[0]));
