import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SFX_DIR = path.resolve(__dirname, '../public/sfx');

if (!fs.existsSync(SFX_DIR)) {
  fs.mkdirSync(SFX_DIR, { recursive: true });
}

/**
 * Tạo buffer WAV PCM 16-bit Mono 44.1kHz từ hàm sinh sóng âm thanh.
 */
function createWavBuffer(sampleRate, durationSeconds, sampleGenerator) {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2; // 16-bit = 2 bytes / sample
  const buffer = Buffer.alloc(44 + dataSize);

  // 1. RIFF Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // 2. fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // Mono (1 channel)
  buffer.writeUInt32LE(sampleRate, 24); // Sample rate
  buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate (SampleRate * 1 * 2)
  buffer.writeUInt16LE(2, 32); // Block align (1 * 2)
  buffer.writeUInt16LE(16, 34); // Bits per sample

  // 3. data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.max(-1, Math.min(1, sampleGenerator(t, durationSeconds)));
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

const SAMPLE_RATE = 44100;

// 1. Click SFX: Đặt quân cờ / Chạm nút (~0.05s)
const clickBuffer = createWavBuffer(SAMPLE_RATE, 0.05, (t) => {
  const decay = Math.exp(-t * 60);
  const freq = 600 - t * 4000;
  return Math.sin(2 * Math.PI * Math.max(freq, 100) * t) * decay;
});
fs.writeFileSync(path.join(SFX_DIR, 'click.wav'), clickBuffer);
console.log('✔ Generated click.wav (%d bytes)', clickBuffer.length);

// 2. Success SFX: Thắng ván / Hợp lệ (~0.22s, hợp âm tăng dần)
const successBuffer = createWavBuffer(SAMPLE_RATE, 0.22, (t, dur) => {
  const decay = 1 - t / dur;
  const f1 = t < 0.1 ? 523.25 : 659.25; // C5 -> E5
  const f2 = t < 0.1 ? 659.25 : 783.99; // E5 -> G5
  return (Math.sin(2 * Math.PI * f1 * t) * 0.6 + Math.sin(2 * Math.PI * f2 * t) * 0.4) * decay;
});
fs.writeFileSync(path.join(SFX_DIR, 'success.wav'), successBuffer);
console.log('✔ Generated success.wav (%d bytes)', successBuffer.length);

// 3. Error SFX: Nước đi sai / Thất bại (~0.18s, âm thanh buzz trầm)
const errorBuffer = createWavBuffer(SAMPLE_RATE, 0.18, (t, dur) => {
  const decay = 1 - t / dur;
  const freq = 140;
  const square = Math.sin(2 * Math.PI * freq * t) > 0 ? 0.7 : -0.7;
  return square * decay;
});
fs.writeFileSync(path.join(SFX_DIR, 'error.wav'), errorBuffer);
console.log('✔ Generated error.wav (%d bytes)', errorBuffer.length);
