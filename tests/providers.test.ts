import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviders } from '../server/providers.ts';
import { blankDraft } from '../shared/domain.ts';
import { encodeWav } from '../src/audio.ts';

test('Gnani-only extraction needs no key, and speech keys stay in request headers', async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const audio = encodeWav(new Float32Array(16000), 16000);
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input); requests.push({ url, init });
    if (url.includes('/stt/')) return Response.json({ success: true, transcript: 'budget 800' });
    return new Response(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/wav' } });
  };
  const providers = createProviders(() => ({ gnani: 'speech-secret' }), fakeFetch);
  const extraction = await providers.extract('budget 800', blankDraft(), []);
  assert.equal(extraction.changes[0].value, 800);
  assert.equal(requests.length, 0);
  assert.equal(await providers.transcribe(Buffer.from(audio)), 'budget 800');
  assert.equal(new Headers(requests[0].init?.headers).get('X-API-Key-ID'), 'speech-secret');
  assert.equal(requests[0].url.includes('speech-secret'), false);
  const form = requests[0].init!.body as FormData;
  assert.equal(form.get('model'), 'prisma-v3.0');
  assert.equal(form.get('format'), 'transcribe');
  assert.equal((await providers.speak('नमस्ते')).length, audio.byteLength);
  const withoutKey = createProviders(() => ({ gnani: '' }), fakeFetch);
  assert.equal(withoutKey.ready().extraction, true);
  await assert.rejects(() => withoutKey.speak('hello'), /not connected/i);
});

test('upstream failures and invalid audio responses are explicit and do not leak body content', async () => {
  const failed = createProviders(() => ({ gnani: 'secret' }), async () => new Response('secret', { status: 403 }));
  await assert.rejects(() => failed.speak('hello'), error => error instanceof Error && /access was refused/i.test(error.message) && !error.message.includes('secret'));
  const malformed = createProviders(() => ({ gnani: 'secret' }), async () => Response.json({ message: 'not audio' }));
  await assert.rejects(() => malformed.speak('hello'), /did not return audio/i);
});
