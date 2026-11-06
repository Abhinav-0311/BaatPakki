import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { applyChanges, blankDraft, confirmDraft, getMissing, indianDate, markReviewed, readback, fieldNames, type Change, type Draft, type Field, type Source } from '../shared/domain.ts';
import { HttpError, validateWav, type Providers } from './providers.ts';
import { Store, type SessionState } from './store.ts';

const versionSchema = z.object({ requestId: z.string().uuid(), version: z.number().int().min(0) });
export function createApp(store: Store, providers: Providers) {
  const app = express(); app.disable('x-powered-by');
  // Private files live beside the source tree; never let Vite or static middleware serve them.
  app.use((req, res, next) => {
    let path: string;
    try { path = decodeURIComponent(req.path).replaceAll('\\', '/'); } catch { return res.sendStatus(400); }
    if (/(?:^|\/)(?:data|artifacts|\.git|\.env[^/]*)(?:\/|$)/i.test(path)) return res.sendStatus(404);
    next();
  });
  const busy = new Set<string>(), rates = new Map<string, { start: number; count: number }>();
  let speaking = false;
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    const host = req.headers.host || '';
    if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)) return res.status(403).json({ error: 'This local app accepts localhost requests only.' });
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `${req.protocol}://${host}`) return res.status(403).json({ error: 'Cross-origin changes are not allowed.' });
    const existing = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('bp_session='))?.slice(11);
    const session = existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : crypto.randomUUID();
    res.locals.session = session;
    if (session !== existing) res.cookie('bp_session', session, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 86400000, path: '/' });
    next();
  });
  app.use('/api', express.json({ limit: '32kb' }));
  const session = (res: Response) => res.locals.session as string;
  const output = (res: Response, state = store.get(session(res))) => ({ ...state, saved: store.list(session(res)), configuration: providers.ready() });
  const checkVersion = (state: SessionState, version: number, requestId: string) => { if (requestId !== state.draft.id || version !== state.draft.version) throw new HttpError(409, 'The request changed in another tab. Refresh to review the latest details.'); };
  const mutate = (handler: (req: Request, res: Response, state: SessionState) => Promise<unknown> | unknown) => async (req: Request, res: Response, next: NextFunction) => {
    const id = session(res);
    if (busy.has(id)) return next(new HttpError(409, 'Your previous request is still processing. Please wait.'));
    const now = Date.now();
    if (rates.size > 200) for (const [key, rate] of rates) if (now - rate.start > 60000) rates.delete(key);
    const rate = rates.get(id);
    if (rate && now - rate.start < 60000 && rate.count >= 30) return next(new HttpError(429, 'Please wait a minute before making more changes.'));
    rates.set(id, rate && now - rate.start < 60000 ? { ...rate, count: rate.count + 1 } : { start: now, count: 1 });
    busy.add(id);
    try { await handler(req, res, store.get(id)); } catch (error) { next(error); } finally { busy.delete(id); }
  };
  app.get('/api/state', (_req, res) => { const state = store.get(session(res)); store.set(session(res), state); res.json(output(res, state)); });
  async function processTurn(res: Response, state: SessionState, text: string, source: Source) {
    if (state.turns.length >= 50) throw new HttpError(422, 'This request has reached 50 turns. Please start a new request.');
    if (state.draft.reviewedVersion === state.draft.version && /^(yes|yes correct|yes confirm|confirm|haan|haan sahi hai|हाँ|हां|हाँ सही है|हां सही है)[.!।\s]*$/iu.test(text.trim())) {
      state.draft = confirmDraft(state.draft, state.draft.version, text); store.save(session(res), state.draft);
      state.turns.push({ id: crypto.randomUUID(), text, source, createdAt: new Date().toISOString(), reply: 'Request confirmed. Your service team still needs to accept the visit.' });
      state.question = null; store.set(session(res), state); return res.json(output(res, state));
    }
    const turnId = crypto.randomUUID();
    if (!providers.ready().extraction) {
      state.draft = { ...state.draft, version: state.draft.version + 1, reviewedVersion: null, status: 'draft', confirmedAt: null };
      state.turns.push({ id: turnId, text, source, createdAt: new Date().toISOString(), reply: 'Your words are captured. Automatic understanding is not connected yet; please add these details to the card using Edit details.' });
      store.set(session(res), state); return res.json(output(res, state));
    }
    const proposal = await providers.extract(text, state.draft, state.turns);
    const next = applyChanges(state.draft, proposal.changes.map(c => ({ ...c, source })), { id: turnId, text });
    if (next.version === state.draft.version) next.version++;
    next.reviewedVersion = null; next.status = 'draft'; next.confirmedAt = null;
    state.draft = next;
    const resolvesPending = state.pendingField && proposal.changes.some(c => c.field === state.pendingField && c.value !== null);
    if (proposal.question) {
      if (state.question && !resolvesPending && state.question !== proposal.question) { state.question += ` ${proposal.question}`; state.pendingField = null; }
      else { state.question = proposal.question; state.pendingField = proposal.questionField ?? null; }
    }
    else if (resolvesPending) { state.question = null; state.pendingField = null; }
    const question = state.question || getMissing(next)[0]?.question || 'All the essentials are here. Please review the full request before confirming.';
    state.turns.push({ id: turnId, text, source, createdAt: new Date().toISOString(), reply: question });
    store.set(session(res), state); res.json(output(res, state));
  }
  app.post('/api/turn', mutate(async (req, res, state) => {
    const { version, requestId, text } = versionSchema.extend({ text: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
    checkVersion(state, version, requestId); await processTurn(res, state, text, 'text');
  }));
  app.post('/api/voice', express.raw({ type: 'audio/wav', limit: '2mb' }), mutate(async (req, res, state) => {
    if (!req.is('audio/wav') || !Buffer.isBuffer(req.body)) throw new HttpError(415, 'Send the recording as audio/wav.');
    const version = z.coerce.number().int().min(0).parse(req.headers['x-draft-version']);
    const requestId = z.string().uuid().parse(req.headers['x-draft-id']); checkVersion(state, version, requestId);
    validateWav(req.body);
    const text = await providers.transcribe(req.body);
    try { await processTurn(res, state, text, 'voice'); }
    catch (error) {
      if (error instanceof HttpError) return res.status(error.status).json({ error: error.message, transcript: text });
      return res.status(422).json({ error: error instanceof Error ? error.message : 'Please check the transcript and retry.', transcript: text });
    }
  }));
  app.post('/api/edit', mutate((req, res, state) => {
    const field = z.object({ field: z.enum(fieldNames as [Field, ...Field[]]), value: z.unknown() }).strict();
    const body = z.union([versionSchema.extend(field.shape).strict(), versionSchema.extend({ changes: z.array(field).min(1).max(10) }).strict()]).parse(req.body); checkVersion(state, body.version, body.requestId);
    const changes = 'changes' in body ? body.changes : [body];
    state.draft = applyChanges(state.draft, changes.map(c => ({ field: c.field, value: c.value, quote: '', source: 'manual' } as Change)));
    if (state.pendingField && changes.some(c => c.field === state.pendingField && c.value !== null)) { state.question = null; state.pendingField = null; }
    store.set(session(res), state); res.json(output(res, state));
  }));
  app.post('/api/acknowledge', mutate((req, res, state) => {
    const { version, requestId } = versionSchema.strict().parse(req.body); checkVersion(state, version, requestId);
    state.question = null; state.pendingField = null; store.set(session(res), state); res.json(output(res, state));
  }));
  app.post('/api/review', mutate((req, res, state) => {
    const { version, requestId } = versionSchema.strict().parse(req.body); checkVersion(state, version, requestId);
    if (state.question) throw new HttpError(422, 'Please resolve the open question, or check the details directly in the card.');
    state.draft = markReviewed(state.draft, version); store.set(session(res), state); res.json(output(res, state));
  }));
  app.post('/api/confirm', mutate((req, res, state) => {
    const { version, requestId } = versionSchema.strict().parse(req.body); checkVersion(state, version, requestId);
    if (state.draft.reviewedVersion !== version) throw new HttpError(409, 'Review the current version before confirming.');
    state.draft = confirmDraft(state.draft, version); store.save(session(res), state.draft); store.set(session(res), state); res.json(output(res, state));
  }));
  app.post('/api/new', mutate((req, res, state) => {
    const { version, requestId } = versionSchema.strict().parse(req.body); checkVersion(state, version, requestId);
    const next = { draft: blankDraft(), turns: [], question: null, sampleStep: null }; store.set(session(res), next); res.json(output(res, next));
  }));
  app.get('/api/saved/:id', (req, res) => {
    const draft = store.saved(session(res), String(req.params.id));
    if (!draft) return res.status(404).json({ error: 'Saved request not found in this browser session.' });
    res.json({ draft });
  });
  app.post('/api/speech', mutate(async (req, res, state) => {
      const { version, requestId, kind } = versionSchema.extend({ kind: z.enum(['question', 'readback']) }).strict().parse(req.body);
      checkVersion(state, version, requestId);
      if (speaking) throw new HttpError(429, 'Another spoken response is finishing. Please retry shortly.');
      if (kind === 'readback' && getMissing(state.draft).length) throw new HttpError(422, 'Complete the details before a full readback.');
      const text = kind === 'readback' ? readback(state.draft) : state.question || getMissing(state.draft)[0]?.question || 'सभी जरूरी जानकारी आ गई है। कृपया पूरी रिक्वेस्ट जाँच कर पुष्टि करें।';
      speaking = true;
      try { const audio = await providers.speak(text); res.type('audio/wav').send(audio); } finally { speaking = false; }
  }));
  app.post('/api/sample', mutate((req, res, state) => {
    const { version, requestId, step } = versionSchema.extend({ step: z.union([z.literal(0), z.literal(1)]) }).strict().parse(req.body); checkVersion(state, version, requestId);
    if (step === 0 && state.draft.version !== 0) throw new HttpError(409, 'Start a new request before loading the saved example.');
    if (step === 1 && state.sampleStep !== 0) throw new HttpError(409, 'Load the first example turn before the details.');
    const text = step === 0
      ? 'AC cooling kam hai. Servicing kal chaar baje, sorry shaam chhe baje. Gas bharne se pehle mujhe call karke approval lena. Budget aath sau hai.'
      : 'Mera naam Aarav Sharma hai. Number 9000000000. Address Flat 203, Demo Apartments, Bhopal.';
    const tomorrow = new Date(`${indianDate()}T12:00:00+05:30`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const entries: [Field, Change['value'], string][] = step === 0 ? [
      ['problem', 'Reduced cooling', 'AC cooling kam hai'], ['work', 'AC servicing', 'Servicing'], ['visitDate', indianDate(tomorrow), 'kal'], ['visitTime', '18:00', 'sorry shaam chhe baje'],
      ['budget', 800, 'Budget aath sau hai'], ['conditions', ['Call and obtain approval before gas filling.'], 'Gas bharne se pehle mujhe call karke approval lena'],
    ] : [['name', 'Aarav Sharma', 'Aarav Sharma'], ['phone', '9000000000', '9000000000'], ['address', 'Flat 203, Demo Apartments, Bhopal', 'Flat 203, Demo Apartments, Bhopal']];
    const turnId = crypto.randomUUID();
    state.draft = applyChanges(state.draft, entries.map(([field, value, quote]) => ({ field, value, quote, source: 'sample' })), { id: turnId, text });
    state.turns.push({ id: turnId, text, source: 'sample', createdAt: new Date().toISOString(), reply: getMissing(state.draft)[0]?.question || 'The saved example is complete. Check every detail, or make a correction on the card.' });
    state.sampleStep = step; store.set(session(res), state); res.json(output(res, state));
  }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'This API route does not exist.' }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return res.status(422).json({ error: 'Please check the submitted details.', details: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof Error && ('type' in error || error instanceof SyntaxError)) return res.status(400).json({ error: 'The request body is invalid or too large.' });
    res.status(422).json({ error: error instanceof Error ? error.message : 'The request could not be processed. Your existing draft is safe.' });
  });
  return app;
}
