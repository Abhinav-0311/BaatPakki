export function encodeWav(samples: Float32Array, sourceRate: number): ArrayBuffer {
  if (!Number.isFinite(sourceRate) || sourceRate < 8000 || sourceRate > 192000) throw new Error('Unsupported microphone sample rate.');
  const rate = 16000, ratio = sourceRate / rate;
  const count = Math.floor(samples.length / ratio);
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const chars = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  chars(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); chars(8, 'WAVE');
  chars(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  chars(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = i * ratio, end = Math.min((i + 1) * ratio, samples.length);
    let sum = 0;
    // shortcut: box filtering is a fallback; use a dedicated resampler if non-16k microphone quality needs improvement.
    for (let j = Math.floor(start); j < Math.ceil(end); j++) sum += (samples[j] || 0) * (Math.min(end, j + 1) - Math.max(start, j));
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, Math.trunc(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}

export type Recording = { stop: () => Promise<Blob>; cancel: () => Promise<void> };
export async function startRecording(onLevel: (level: number) => void, signal?: AbortSignal): Promise<Recording> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone recording needs localhost or a secure HTTPS connection.');
  signal?.throwIfAborted();
  const stream = await new Promise<MediaStream>((resolve, reject) => {
    const abort = () => reject(new DOMException('Microphone request cancelled.', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false }).then(stream => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) { stream.getTracks().forEach(track => track.stop()); abort(); } else resolve(stream);
    }, error => { signal?.removeEventListener('abort', abort); reject(error); });
  });
  let context: AudioContext | undefined;
  let moduleUrl: string | undefined;
  try {
    context = new AudioContext({ sampleRate: 16000 });
    const chunks: Float32Array[] = [];
    const code = `class Capture extends AudioWorkletProcessor {
      process(inputs) { const channel = inputs[0]?.[0]; if (channel) this.port.postMessage(new Float32Array(channel)); return true; }
    } registerProcessor('bp-capture', Capture);`;
    moduleUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(moduleUrl);
    signal?.throwIfAborted();
    const source = context.createMediaStreamSource(stream), node = new AudioWorkletNode(context, 'bp-capture');
    const mute = context.createGain(); mute.gain.value = 0;
    let total = 0, stopped = false;
    node.port.onmessage = event => {
      if (stopped || total >= context!.sampleRate * 29) return;
      const chunk = event.data as Float32Array; chunks.push(chunk); total += chunk.length;
      onLevel(Math.min(1, Math.sqrt(chunk.reduce((a, b) => a + b * b, 0) / chunk.length) * 7));
    };
    source.connect(node); node.connect(mute); mute.connect(context.destination); await context.resume();
    const close = async () => {
      stopped = true; node.port.close(); source.disconnect(); node.disconnect(); mute.disconnect();
      stream.getTracks().forEach(track => track.stop()); await context!.close(); onLevel(0);
    };
    return {
      stop: async () => {
        if (stopped) throw new Error('This recording has already stopped.');
        await close();
        const samples = new Float32Array(total); let offset = 0;
        for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
        return new Blob([encodeWav(samples, context!.sampleRate)], { type: 'audio/wav' });
      },
      cancel: async () => { if (!stopped) await close(); },
    };
  } catch (error) { stream.getTracks().forEach(track => track.stop()); await context?.close(); throw error; }
  finally { if (moduleUrl) URL.revokeObjectURL(moduleUrl); }
}
