import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, startRecording } from '../src/audio.ts';
import { validateWav } from '../server/providers.ts';

test('microphone samples are actually resampled to mono PCM16 WAV', () => {
  const samples = new Float32Array(48_000).fill(0.5);
  const wav = encodeWav(samples, 48000);
  const view = new DataView(wav);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(40, true), 32000);
  assert.equal(view.getInt16(44, true), 16383);
  assert.equal(validateWav(Buffer.from(wav)), 1);
});
test('reject malformed, truncated, wrong-rate, too-short and overlong audio before upload', () => {
  assert.throws(() => validateWav(Buffer.from('not a wav')), /WAV/i);
  const wav = Buffer.from(encodeWav(new Float32Array(16000), 16000));
  assert.throws(() => validateWav(wav.subarray(0, 50)), /WAV|truncated/i);
  const wrongRate = Buffer.from(wav); wrongRate.writeUInt32LE(48000, 24);
  assert.throws(() => validateWav(wrongRate), /16000|16 kHz/i);
  assert.throws(() => validateWav(Buffer.from(encodeWav(new Float32Array(10), 16000))), /short/i);
  assert.throws(() => validateWav(Buffer.from(encodeWav(new Float32Array(16000 * 31), 16000))), /30 seconds/i);
});
test('high-bit signatures and data-before-format WAV chunks are rejected', () => {
  const wav = Buffer.from(encodeWav(new Float32Array(16000), 16000));
  const corrupt = Buffer.from(wav); corrupt[0] |= 128;
  assert.throws(() => validateWav(corrupt), /WAV/i);
  const reordered = Buffer.concat([wav.subarray(0, 12), wav.subarray(36), wav.subarray(12, 36)]);
  assert.throws(() => validateWav(reordered), /WAV|format/i);
});
test('cancelled microphone permission does not retain a stream that arrives later', async () => {
  let provide!: (stream: MediaStream) => void; let stopped = false;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => new Promise(resolve => { provide = resolve; }) } });
  const controller = new AbortController(); const pending = startRecording(() => {}, controller.signal);
  controller.abort(); await assert.rejects(() => pending, /cancel|abort/i);
  provide({ getTracks: () => [{ stop: () => { stopped = true; } }] } as unknown as MediaStream);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(stopped, true);
});
