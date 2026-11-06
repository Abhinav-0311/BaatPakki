import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.ts';
import { Store } from '../server/store.ts';
import { parseRequest } from '../server/parser.ts';
import { encodeWav } from '../src/audio.ts';
import { spokenCorrection, approvalInstruction, periodReplies } from './fixtures/time-correction.ts';

test('session isolation, version checks, review, confirmation, and saved revisions', async () => {
  const store = new Store(':memory:');
  const app = createApp(store, {
    ready: () => ({ speech: false, extraction: true }),
    extract: async (text, draft, turns) => parseRequest(text, draft, turns),
    transcribe: async () => { throw new Error('Must not be called'); },
    speak: async () => { throw new Error('Must not be called'); },
  });
  app.get('/data/baatpakki.sqlite', (_req, res) => res.send('private database'));
  app.get(/^\/@fs\//, (_req, res) => res.send('private journal'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = '', requestId = '';
  const call = async (path: string, body?: unknown, useCookie = cookie) => {
    const response = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: useCookie }, body: body ? JSON.stringify({ requestId, ...body as object }) : undefined });
    if (!cookie) cookie = response.headers.get('set-cookie')?.split(';')[0] || '';
    const data = await response.json() as any;
    if (data.draft) requestId = data.draft.id;
    return { status: response.status, body: data };
  };
  try {
    let response = await call('/state');
    assert.equal(response.body.draft.version, 0);
    assert.equal((await fetch(`${base}/data/baatpakki.sqlite`)).status, 404);
    assert.equal((await fetch(`${base}/@fs/E:/project/data/baatpakki.sqlite-wal`)).status, 404);
    response = await call('/sample', { version: 0, step: 0 });
    assert.equal(response.status, 200);
    assert.equal(response.body.draft.fields.budget, 800);
    assert.equal((await call('/review', { version: response.body.draft.version })).status, 422);
    response = await call('/sample', { version: response.body.draft.version, step: 1 });
    const version = response.body.draft.version;
    assert.equal((await call('/confirm', { version })).status, 409);
    assert.equal((await call('/review', { version })).status, 200);
    response = await call('/confirm', { version });
    assert.equal(response.status, 200);
    assert.equal(response.body.draft.status, 'confirmed');
    assert.equal(response.body.saved.length, 1);
    const savedId = response.body.saved[0].id;
    assert.equal((await call(`/saved/${savedId}`, undefined, '')).status, 404);
    assert.equal((await call(`/saved/${savedId}`)).status, 200);
    response = await call('/edit', { version, field: 'budget', value: 900 });
    assert.equal(response.body.draft.reviewedVersion, null);
    assert.equal(response.body.saved.length, 1);
    assert.equal((await call('/confirm', { version })).status, 409);
    assert.equal((await call('/voice', { version })).status, 415);
    const crossOrigin = await fetch(`${base}/api/new`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://unrelated.example' }, body: JSON.stringify({ version: response.body.draft.version }) });
    assert.equal(crossOrigin.status, 403);
    const hostile = await fetch(`${base}/api/turn`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ text: '  ', version: response.body.draft.version }) });
    assert.equal(hostile.status, 422);
    const oldId = requestId;
    response = await call('/new', { version: response.body.draft.version });
    response = await call('/sample', { version: response.body.draft.version, step: 0 });
    response = await call('/sample', { version: response.body.draft.version, step: 1 });
    response = await call('/review', { version: response.body.draft.version });
    assert.equal((await call('/confirm', { version: response.body.draft.version, requestId: oldId })).status, 409);
    response = await call('/turn', { version: response.body.draft.version, text: 'Remove restriction' });
    assert.ok(response.body.question);
    response = await call('/turn', { version: response.body.draft.version, text: 'Budget 900' });
    assert.ok(response.body.question, 'an unrelated turn must not clear an unresolved instruction');
    response = await call('/edit', { version: response.body.draft.version, field: 'name', value: 'Aarav Kumar' });
    assert.ok(response.body.question, 'an unrelated manual edit must not clear the question');
    assert.equal((await call('/review', { version: response.body.draft.version })).status, 422);
    response = await call('/acknowledge', { version: response.body.draft.version });
    assert.equal(response.body.question, null);
    assert.equal((await call('/review', { version: response.body.draft.version })).status, 200);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});

test('reported voice correction and follow-ups do not loop or erase unrelated open instructions', async () => {
  const store = new Store(':memory:');
  const app = createApp(store, {
    ready: () => ({ speech: true, extraction: true }),
    extract: async (text, draft, turns) => parseRequest(text, draft, turns),
    transcribe: async () => spokenCorrection,
    speak: async () => { throw new Error('Must not be called'); },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let state: any, cookie = '';
  async function call(path: string, body?: object) {
    const response = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify({ requestId: state.draft.id, version: state.draft.version, ...body }) : undefined });
    cookie ||= response.headers.get('set-cookie')?.split(';')[0] || '';
    const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); state = data; return data;
  }
  try {
    await call('/state');
    const response = await fetch(`${base}/api/voice`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'audio/wav', 'X-Draft-Id': state.draft.id, 'X-Draft-Version': String(state.draft.version) }, body: encodeWav(new Float32Array(16000), 16000) });
    state = await response.json(); assert.equal(response.status, 200);
    assert.equal(state.draft.fields.visitTime, '19:00');
    assert.deepEqual(state.draft.fields.conditions, [approvalInstruction]);
    for (const text of [...periodReplies, '7 pm']) {
      await call('/turn', { text });
      assert.equal(state.question, null, text);
      assert.equal(state.draft.fields.visitTime, '19:00');
    }
    await call('/turn', { text: '4 PM or 6 PM' });
    assert.ok(state.question);
    await call('/turn', { text: 'Leave the receipt with the neighbour.' });
    await call('/turn', { text: 'Leave the receipt with the neighbour.' });
    assert.equal((state.question.match(/I could not confidently map/g) || []).length, 1);
    await call('/turn', { text: 'Budget 900' });
    assert.match(state.question, /more than one time/);
    await call('/turn', { text: '7 pm' });
    assert.equal(state.draft.fields.visitTime, '19:00');
    assert.doesNotMatch(state.question, /more than one time/);
    assert.match(state.question, /I could not confidently map/);
    await call('/acknowledge', {});
    assert.equal(state.question, null);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});
