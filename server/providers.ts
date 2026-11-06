import { parseRequest, type Proposal } from './parser.ts';
import { type Draft, type Turn } from '../shared/domain.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type Providers = {
  ready: () => { speech: boolean; extraction: boolean };
  extract: (text: string, draft: Draft, turns: Turn[]) => Promise<Proposal>;
  transcribe: (audio: Buffer) => Promise<string>;
  speak: (text: string) => Promise<Buffer>;
};
type Keys = { gnani: string };

export function validateWav(audio: Buffer): number {
  if (audio.length < 44 || audio.toString('latin1', 0, 4) !== 'RIFF' || audio.toString('latin1', 8, 12) !== 'WAVE') throw new HttpError(422, 'Please send a valid WAV recording.');
  if (audio.readUInt32LE(4) + 8 !== audio.length) throw new HttpError(422, 'The WAV recording is truncated or invalid.');
  let at = 12, format = false, dataBytes = 0;
  while (at + 8 <= audio.length) {
    const kind = audio.toString('latin1', at, at + 4), size = audio.readUInt32LE(at + 4), end = at + 8 + size;
    if (end > audio.length) throw new HttpError(422, 'The WAV recording is truncated.');
    if (kind === 'fmt ') {
      if (size < 16 || audio.readUInt16LE(at + 8) !== 1 || audio.readUInt16LE(at + 10) !== 1 || audio.readUInt32LE(at + 12) !== 16000 || audio.readUInt32LE(at + 16) !== 32000 || audio.readUInt16LE(at + 20) !== 2 || audio.readUInt16LE(at + 22) !== 16) {
        throw new HttpError(422, 'Use mono, 16-bit, 16 kHz (16000 Hz) PCM WAV audio.');
      }
      format = true;
    }
    if (kind === 'data') { if (!format) throw new HttpError(422, 'WAV format must come before samples.'); if (size % 2) throw new HttpError(422, 'Invalid WAV sample size.'); dataBytes += size; }
    at = end + (size % 2);
  }
  if (!format || !dataBytes || at !== audio.length) throw new HttpError(422, 'Invalid WAV audio chunks.');
  const seconds = dataBytes / 32000;
  if (seconds < 0.25) throw new HttpError(422, 'That recording is too short. Please record a full sentence.');
  if (seconds > 30) throw new HttpError(422, 'Keep each recording under 30 seconds.');
  return seconds;
}

export function createProviders(keys: () => Keys, fetcher: typeof fetch = fetch): Providers {
  async function request(url: string, init: RequestInit, service: string) {
    let response: Response;
    try { response = await fetcher(url, { ...init, signal: AbortSignal.timeout(45000) }); }
    catch { throw new HttpError(502, `${service} could not be reached. Your draft is safe; please retry.`); }
    if (!response.ok) {
      const hint = response.status === 429 ? 'is busy or rate limited. Please wait before retrying.' : response.status === 401 || response.status === 403 ? 'access was refused. Please check the key and available credits locally.' : `returned an error (${response.status}). Please retry.`;
      throw new HttpError(502, `${service} ${hint}`);
    }
    return response;
  }
  return {
    ready: () => ({ speech: Boolean(keys().gnani), extraction: true }),
    async transcribe(audio) {
      validateWav(audio);
      const { gnani } = keys();
      if (!gnani) throw new HttpError(503, 'Voice is not connected yet. You can edit the card directly.');
      const form = new FormData();
      form.set('audio_file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'request.wav');
      form.set('model', 'prisma-v3.0'); form.set('language_code', 'hi-IN,en-IN'); form.set('format', 'transcribe');
      form.set('keyterms', JSON.stringify(['AC servicing', 'cooling', 'gas filling', 'inspection', 'approval']));
      form.set('topic', 'A customer requesting AC servicing. Keep corrections, appointment times, maximum budgets, and restrictions exactly as spoken.');
      const response = await request('https://api.vachana.ai/stt/v3', { method: 'POST', headers: { 'X-API-Key-ID': gnani }, body: form }, 'Speech recognition');
      const body = await response.json() as { success?: boolean; transcript?: string };
      if (!body.success || typeof body.transcript !== 'string' || !body.transcript.trim() || body.transcript.length > 4000) throw new HttpError(422, 'No usable speech was returned. Please speak again or type your request.');
      return body.transcript.trim();
    },
    extract: async (text, draft, turns) => parseRequest(text, draft, turns),
    async speak(text) {
      const { gnani } = keys();
      if (!gnani) throw new HttpError(503, 'Spoken playback is not connected. You can read and confirm the written details.');
      if (text.length > 3000) throw new HttpError(422, 'This readback is too long for one request. Please shorten the card before spoken playback.');
      const response = await request('https://api.vachana.ai/api/v1/tts/inference', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key-ID': gnani },
        body: JSON.stringify({ text, model: 'timbre-v3.0', voice: 'Shivani', language: 'hi-IN', speed: 1, audio_config: { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' } }),
      }, 'Spoken playback');
      if (!(response.headers.get('content-type') || '').includes('audio/')) throw new HttpError(502, 'Spoken playback did not return audio. Please read the written details.');
      const audio = Buffer.from(await response.arrayBuffer());
      if (audio.length < 44 || audio.toString('latin1', 0, 4) !== 'RIFF') throw new HttpError(502, 'Spoken playback returned invalid audio. Please read the written details.');
      return audio;
    },
  };
}
