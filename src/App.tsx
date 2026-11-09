import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { fieldLabels, fieldNames, formatDate, formatTime, getMissing, indianDate, readback, type Draft, type Field, type Fields, type Turn } from '../shared/domain.ts';
import { startRecording, type Recording } from './audio.ts';

type ClientState = { draft: Draft; turns: Turn[]; question: string | null; sampleStep: number | null; saved: { id: string; name: string | null; createdAt: string; version: number }[]; configuration: { speech: boolean; extraction: boolean } };
type IconName = 'mic' | 'arrow' | 'check' | 'edit' | 'close' | 'speaker' | 'pause' | 'history' | 'plus' | 'print' | 'quote' | 'refresh' | 'arrowUp';
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    arrowUp: <path d="M12 20V4m-6 6 6-6 6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    edit: <><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    speaker: <><path d="M11 4 5 9H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    print: <><path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6v-7ZM17 12h1" /></>,
    quote: <><path d="M10 6H4v7h5c0 4-3 5-4 5M21 6h-6v7h5c0 4-3 5-4 5" /></>,
    refresh: <><path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby="modal-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-head"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>{children}
  </dialog>;
}
class ApiError extends Error { constructor(message: string, public transcript?: string) { super(message); } }
async function request<T>(path: string, body?: unknown, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, ...options });
  const data = await response.json().catch(() => ({ error: 'The server did not return a usable response. Please try again.' }));
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', data.transcript);
  return data as T;
}
function displayValue(field: Field, value: Fields[Field]): string {
  if (value === null) return 'Not specified';
  if (field === 'visitDate') return formatDate(value as string);
  if (field === 'visitTime') return formatTime(value as string);
  if (field === 'budget') return `₹${Number(value).toLocaleString('en-IN')}`;
  return Array.isArray(value) ? value.join('\n') : String(value);
}
const greeting = 'Tell us what your AC needs. You can speak naturally, change your mind, and check every detail before confirming.';

export default function App() {
  const [state, setState] = useState<ClientState | null>(null);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [recording, setRecording] = useState(false), [elapsed, setElapsed] = useState(0), [level, setLevel] = useState(0);
  const [editor, setEditor] = useState(false), [editValues, setEditValues] = useState<Record<Field, string> | null>(null);
  const [history, setHistory] = useState(false), [archived, setArchived] = useState<Draft | null>(null), [source, setSource] = useState<Field | null>(null);
  const [speechOn, setSpeechOn] = useState(true), [audioUrl, setAudioUrl] = useState('');
  const [printDraft, setPrintDraft] = useState<Draft | null>(null);
  const recorder = useRef<Recording | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null), recordingStarted = useRef(0);
  const player = useRef<HTMLAudioElement | null>(null), audioObjectUrl = useRef('');
  const speechRequest = useRef<AbortController | null>(null), micRequest = useRef<AbortController | null>(null);
  const sourceAudio = useRef(new Map<string, string>()), stopRef = useRef<() => Promise<void>>(async () => {});
  const chatEnd = useRef<HTMLDivElement>(null), reviewTitle = useRef<HTMLHeadingElement>(null);

  useEffect(() => { request<ClientState>('/state').then(setState).catch(e => setError(e.message)); return () => {
    speechRequest.current?.abort(); micRequest.current?.abort(); void recorder.current?.cancel(); if (timer.current) clearInterval(timer.current);
    if (audioObjectUrl.current) URL.revokeObjectURL(audioObjectUrl.current);
    for (const url of sourceAudio.current.values()) URL.revokeObjectURL(url);
  }; }, []);
  useEffect(() => { if (state?.turns.length) chatEnd.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' }); }, [state?.turns.length]);
  function report(e: unknown) { setError(e instanceof Error ? e.message : 'Please try again.'); if (e instanceof ApiError && e.transcript) setMessage(e.transcript); }
  async function run(label: string, action: () => Promise<void>) { if (busy || recording) return; setBusy(label); setError(''); try { await action(); } catch (e) { report(e); } finally { setBusy(null); } }
  function stopPlayback() {
    speechRequest.current?.abort(); speechRequest.current = null;
    document.querySelectorAll('audio').forEach(audio => audio.pause());
  }
  function onlyAudio(audio: HTMLAudioElement) {
    document.querySelectorAll('audio').forEach(other => { if (other !== audio || recorder.current || micRequest.current) other.pause(); });
  }
  async function playSpeech(next: ClientState, kind: 'question' | 'readback') {
    stopPlayback(); const controller = new AbortController(); speechRequest.current = controller;
    try {
      const response = await fetch('/api/speech', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: next.draft.id, version: next.draft.version, kind }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Spoken playback is unavailable. The written details are still here.'); }
      const blob = await response.blob(); if (controller.signal.aborted) return;
      if (audioObjectUrl.current) URL.revokeObjectURL(audioObjectUrl.current);
      const url = URL.createObjectURL(blob); audioObjectUrl.current = url; setAudioUrl(url);
      requestAnimationFrame(() => {
        if (controller.signal.aborted || !player.current) return;
        void player.current.play().then(() => { if (controller.signal.aborted) player.current?.pause(); }).catch(() => setError('Your browser paused playback. Use the audio player below to listen.'));
      });
    } catch (error) { if (!controller.signal.aborted) throw error; }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!state || !message.trim()) return;
    const text = message;
    await run('Checking your request', async () => {
      stopPlayback(); const next = await request<ClientState>('/turn', { text, requestId: state.draft.id, version: state.draft.version }); setState(next); setMessage('');
      if (speechOn && next.configuration.speech && next.draft.status !== 'confirmed') { setBusy('Preparing a spoken reply'); await playSpeech(next, 'question'); }
    });
  }
  async function stopRecording() {
    const capture = recorder.current; if (!capture || !state) return;
    recorder.current = null; if (timer.current) clearInterval(timer.current); setRecording(false); setBusy('Transcribing your request'); setError('');
    try {
      const blob = await capture.stop();
      const next = await request<ClientState>('/voice', undefined, { method: 'POST', headers: { 'Content-Type': 'audio/wav', 'X-Draft-Version': String(state.draft.version), 'X-Draft-Id': state.draft.id }, body: blob });
      const turnId = next.turns.at(-1)?.id; if (turnId) sourceAudio.current.set(turnId, URL.createObjectURL(blob));
      setState(next);
      if (speechOn && next.draft.status !== 'confirmed') { setBusy('Preparing a spoken reply'); await playSpeech(next, 'question'); }
    } catch (e) { report(e); } finally { setBusy(null); setLevel(0); }
  }
  stopRef.current = stopRecording;
  async function toggleRecording() {
    if (recording) return stopRecording();
    if (busy || !state) return;
    setError(''); stopPlayback(); setBusy('Opening your microphone');
    const controller = new AbortController(); micRequest.current = controller;
    try {
      const capture = await startRecording(setLevel, controller.signal);
      if (controller.signal.aborted) { await capture.cancel(); return; }
      recorder.current = capture; setElapsed(0); setRecording(true); recordingStarted.current = Date.now();
      timer.current = setInterval(() => { const seconds = (Date.now() - recordingStarted.current) / 1000; setElapsed(seconds); if (seconds >= 28) void stopRef.current(); }, 150);
    } catch (e) { if (controller.signal.aborted) return; setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Microphone permission was not granted. You can type your request or edit the card.' : e instanceof Error ? e.message : 'The microphone could not start.'); }
    finally { if (micRequest.current === controller) { micRequest.current = null; setBusy(null); } }
  }
  function openEditor() {
    if (!state) return;
    setEditValues(Object.fromEntries(fieldNames.map(field => [field, Array.isArray(state.draft.fields[field]) ? (state.draft.fields[field] as string[]).join('\n') : String(state.draft.fields[field] ?? '')])) as Record<Field, string>);
    setEditor(true);
  }
  async function saveEdits(event: FormEvent) {
    event.preventDefault(); if (!state || !editValues) return;
    const changes = fieldNames.map(field => {
      const raw = editValues[field].trim();
      const value = field === 'conditions' ? raw.split('\n').map(x => x.trim()).filter(Boolean) : field === 'budget' ? raw ? Number(raw) : null : raw || null;
      return { field, value };
    }).filter(c => JSON.stringify(c.value) !== JSON.stringify(state.draft.fields[c.field]));
    if (!changes.length) { setEditor(false); return; }
    await run('Saving your corrections', async () => { stopPlayback(); setState(await request<ClientState>('/edit', { requestId: state.draft.id, version: state.draft.version, changes })); setEditor(false); });
  }
  async function review() {
    if (!state) return;
    await run('Preparing the full readback', async () => {
      const next = await request<ClientState>('/review', { requestId: state.draft.id, version: state.draft.version }); setState(next);
      requestAnimationFrame(() => reviewTitle.current?.focus());
      if (speechOn && next.configuration.speech) await playSpeech(next, 'readback');
    });
  }
  function print(draft: Draft) { setPrintDraft(draft); requestAnimationFrame(() => window.print()); }
  async function newRequest() {
    if (!state) return;
    if (state.draft.version > 0 && state.draft.status !== 'confirmed' && !window.confirm('Start a new request? This unfinished draft will be replaced. Confirmed requests stay saved.')) return;
    await run('Starting a fresh request', async () => {
      stopPlayback(); for (const url of sourceAudio.current.values()) URL.revokeObjectURL(url); sourceAudio.current.clear();
      setState(await request<ClientState>('/new', { requestId: state.draft.id, version: state.draft.version })); setMessage(''); setAudioUrl('');
    });
  }
  const locked = Boolean(busy) || recording;
  const draft = state?.draft, f = draft?.fields, missing = draft ? getMissing(draft) : [];
  const ready = Boolean(draft && !missing.length && !state?.question);
  const reviewed = Boolean(draft && draft.reviewedVersion === draft.version);
  const confirmed = draft?.status === 'confirmed';
  const progress = draft ? 7 - missing.length : 0;
  const evidence = source && draft?.evidence[source];
  const evidenceTurn = evidence?.turnId ? state?.turns.find(t => t.id === evidence.turnId) : null;
  function cardField(field: Field, wide = false) {
    const value = f?.[field]; const has = value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0);
    return <div className={`card-field ${wide ? 'full' : ''} ${has ? 'filled' : ''}`} key={field}>
      <div className="field-label">{fieldLabels[field]}{draft?.evidence[field] && <button className="source-button" title={`Show source for ${fieldLabels[field]}`} aria-label={`Show source for ${fieldLabels[field]}`} onClick={() => setSource(field)}><Icon name="quote" size={12} /></button>}</div>
      <div className={`field-value ${!has ? 'placeholder' : ''}`}>{has ? displayValue(field, value) : field === 'budget' ? 'No limit specified' : 'Waiting for your details'}</div>
    </div>;
  }

  return <>
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="BaatPakki home"><span className="brand-symbol"><Icon name="check" size={19} /></span>Baat<span>Pakki</span><span className="brand-period">.</span></a>
        <span className="header-context">A little clarity goes a long way.</span>
        <div className="header-actions"><button className="text-button" disabled={!state || locked} aria-label="Saved requests" onClick={() => setHistory(true)}><Icon name="history" size={17} /><span>Saved requests</span>{Boolean(state?.saved.length) && <span className="count">{state?.saved.length}</span>}</button><span className="header-divider" /><button className="text-button" disabled={!state || locked} aria-label="New request" onClick={newRequest}><Icon name="plus" size={17} /><span>New request</span></button></div>
      </header>
      <main>
        <div className="intro-row"><div><p className="eyebrow"><span className="tiny-line" />AC SERVICE, WITHOUT THE BACK-AND-FORTH</p><h1>Say it your way.<br /><em>Get every detail right.</em></h1><p className="intro-copy">Aap boliye. Hum likh lete hain.<br className="mobile-break" /> Check it together, then make it pakki.</p></div><div className="process-note"><span>01 / SAY IT</span><span>02 / CHECK IT</span><span>03 / PAKKI <Icon name="check" size={13} /></span></div></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={17} /></button></div>}
        {!state ? <div className="initial-loading" role="status">{error ? <button className="primary-button" onClick={() => run('Reconnecting', async () => setState(await request<ClientState>('/state')))}>Try connecting again</button> : <><span className="spinner" /> Getting your workspace ready…</>}</div> : <div className="workspace">
          <section className="conversation" aria-labelledby="conversation-title">
            <div className="section-heading"><div><span className="section-number">01</span><h2 id="conversation-title">The conversation</h2></div><span className={`connection ${state.configuration.speech ? 'connected' : ''}`}><span />{state.configuration.speech ? 'Voice connected' : 'Typing available'}</span></div>
            <div className={`voice-area ${recording ? 'is-recording' : ''}`}>
              <div className="voice-wave" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i} style={{ transform: `scaleY(${recording ? (8 + level * (20 + (3 - Math.abs(i - 3)) * 12)) / 54 : [0.22, 0.43, 0.68, 1, 0.68, 0.43, 0.22][i]})` }} />)}</div>
              <button className={`record-button ${recording ? 'active' : ''}`} onClick={toggleRecording} disabled={Boolean(busy) || !state.configuration.speech || confirmed} aria-label={recording ? 'Stop recording and process request' : 'Start recording your request'}>{recording ? <span className="stop-square" /> : <Icon name="mic" size={27} />}</button>
              <h3>{recording ? 'We’re listening.' : confirmed ? 'Baat pakki.' : busy || 'Tell us what you need.'}</h3>
              <p>{recording ? `${Math.floor(elapsed)}s / 28s · Tap to finish` : confirmed ? 'Your checked request is saved.' : 'Hindi, Hinglish or English. A sentence at a time.'}</p>
              {busy === 'Opening your microphone' && <button className="inline-link" onClick={() => { micRequest.current?.abort(); micRequest.current = null; setBusy(null); }}>Continue by typing</button>}
              <div className="voice-settings"><button className="setting-toggle" aria-pressed={speechOn} onClick={() => { setSpeechOn(!speechOn); stopPlayback(); }}><Icon name="speaker" size={13} />Spoken replies<span className={`mini-toggle ${speechOn ? 'on' : ''}`} /></button></div>
            </div>
            {!state.configuration.speech && <p className="connection-note">Voice is not connected yet. You can type, edit the card, or explore the saved example.<button onClick={() => run('Checking voice connection', async () => setState(await request<ClientState>('/state')))} disabled={locked}>Check again</button></p>}
            <div className="chat-log" aria-live="polite" aria-relevant="additions text" aria-busy={Boolean(busy)}>
              <div className="assistant-message"><span className="assistant-mark">b.</span><div><p>{greeting}</p>{!state.turns.length && <p className="example-hint">“AC cooling kam hai. Kal shaam chhe baje servicing chahiye…”</p>}</div></div>
              {state.turns.map(turn => <div key={turn.id} className="turn"><div className="customer-message"><span className="message-source">{turn.source === 'sample' ? 'SAVED EXAMPLE · NOT LIVE AUDIO' : turn.source === 'voice' ? 'YOU SAID' : 'YOU WROTE'}</span><p>{turn.text}</p>{sourceAudio.current.has(turn.id) && <audio className="source-audio" onPlay={e => onlyAudio(e.currentTarget)} controls preload="none" src={sourceAudio.current.get(turn.id)} aria-label="Your original recording" />}</div><div className="assistant-message"><span className="assistant-mark">b.</span><p>{turn.reply}</p></div></div>)}
              {busy && <div className="processing-line" role="status"><span className="spinner" />{busy}…</div>}<div ref={chatEnd} />
            </div>
            {audioUrl && <div className="reply-audio"><span>Spoken response</span><audio ref={player} controls src={audioUrl} aria-label="Spoken response from Gnani Timbre" onPlay={e => onlyAudio(e.currentTarget)} /></div>}
            {!confirmed && <form onSubmit={send} className="composer"><label className="sr-only" htmlFor="message">Type your request or correction</label><textarea id="message" value={message} onChange={event => setMessage(event.target.value)} placeholder="Or type your request here…" rows={2} maxLength={2000} disabled={locked} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(event); } }} /><button className="send-button" type="submit" aria-label="Send request" disabled={locked || !message.trim()}><Icon name="arrowUp" size={19} /></button></form>}
            <div className="conversation-bottom"><span>Guided understanding. Always check the card.</span>{!state.turns.length && <button className="inline-link" disabled={locked || draft!.version > 0} onClick={() => run('Opening the saved example', async () => setState(await request<ClientState>('/sample', { requestId: draft!.id, version: draft!.version, step: 0 })))}>Try a saved example <Icon name="arrow" size={14} /></button>}{state.sampleStep === 0 && <button className="inline-link" disabled={locked} onClick={() => run('Adding example details', async () => setState(await request<ClientState>('/sample', { requestId: draft!.id, version: draft!.version, step: 1 })))}>Add example contact details <Icon name="arrow" size={14} /></button>}</div>
          </section>

          <aside className="request-panel" aria-labelledby="card-title">
            <div className="section-heading"><div><span className="section-number">02</span><h2 id="card-title">Your request, in writing</h2></div><span className="detail-count">{progress}/7 essentials</span></div>
            <div className={`job-card ${confirmed ? 'is-confirmed' : ''}`}>
              <div className="card-top"><div className="card-brand">BaatPakki<span>.</span><p>SERVICE REQUEST</p></div><div className="request-id">#{draft!.id.slice(0, 6).toUpperCase()}<span>AC SERVICE</span></div></div>
              <div className="card-status"><span className={`status-pill ${confirmed ? 'confirmed' : reviewed ? 'reviewed' : ''}`}><span />{confirmed ? 'Customer confirmed' : reviewed ? 'Ready for your confirmation' : ready ? 'Ready to review' : 'Taking details'}</span><button className="edit-button" onClick={openEditor} disabled={locked}><Icon name="edit" size={13} />Edit details</button></div>
              <div className="card-grid">{cardField('problem', true)}{cardField('work', true)}<div className="card-separator" />{cardField('visitDate')}{cardField('visitTime')}{cardField('address', true)}<div className="card-separator" />{cardField('name')}{cardField('phone')}</div>
              <div className={`budget-box ${f!.budget !== null ? 'has-budget' : ''}`}><div><span className="field-label">MAXIMUM BUDGET</span><strong>{f!.budget !== null ? `₹${f!.budget.toLocaleString('en-IN')}` : 'Not specified'}</strong></div><span>A spending limit,<br />not a quoted price.</span></div>
              <div className="conditions-box"><div className="field-label"><span className="condition-icon">!</span>APPROVAL & INSTRUCTIONS{draft!.evidence.conditions && <button className="source-button" aria-label="Show source for Approval & instructions" onClick={() => setSource('conditions')}><Icon name="quote" size={12} /></button>}</div>{f!.conditions.length ? <ul>{f!.conditions.map((condition, i) => <li key={i}>{condition}</li>)}</ul> : <p className="placeholder">Any restrictions you mention will stay here.</p>}</div>
              <div className="card-foot"><span>{confirmed ? 'CHECKED BY YOU' : 'NOT CONFIRMED YET'}</span><span>Version {draft!.version}</span></div>
            </div>
            <div className="confirmation-area">
              {state.question && <div className="open-question"><p>{state.question}</p><button className="inline-link" disabled={locked} onClick={() => run('Acknowledging your check', async () => setState(await request<ClientState>('/acknowledge', { requestId: draft!.id, version: draft!.version })))}>I’ve checked this detail on the card</button></div>}
              {confirmed ? <><div className="success-line"><span><Icon name="check" size={16} /></span><div><strong>That’s a pakki request.</strong><p>Saved. Your service team still needs to accept the visit.</p></div></div><button className="secondary-button full-width" onClick={() => print(draft!)}><Icon name="print" size={17} />Print / save as PDF</button></> : reviewed ? <><div className="review-copy"><h3 ref={reviewTitle} tabIndex={-1}>One last check.</h3><p lang="hi">{readback(draft!)}</p><button className="inline-link" disabled={locked || !state.configuration.speech} onClick={() => run('Preparing spoken readback', () => playSpeech(state, 'readback'))}><Icon name="speaker" size={14} />Listen to the full readback</button></div><button className="primary-button full-width" disabled={locked} onClick={() => run('Saving your confirmed request', async () => { stopPlayback(); setState(await request<ClientState>('/confirm', { requestId: draft!.id, version: draft!.version })); })}><Icon name="check" size={17} />Yes, these details are correct</button><p className="confirmation-note">Confirms your instructions. The service team accepts the appointment separately.</p></> : <><button className="primary-button full-width" disabled={locked || !ready} onClick={review}>Review the full request<Icon name="arrow" size={17} /></button><p className="confirmation-note">{missing.length ? `${missing.length} essential ${missing.length === 1 ? 'detail' : 'details'} to add. Speak, type, or edit the card.` : 'Check the details together before confirming.'}</p></>}
            </div>
          </aside>
        </div>}
      </main>
      <footer className="site-footer"><span>Say it. Check it. <strong>Pakki.</strong></span><span>Speech by <a href="https://www.gnani.ai/" target="_blank" rel="noreferrer">Gnani AI <Icon name="arrow" size={12} /></a><span className="footer-dot">·</span>Made for the way we speak.</span></footer>
    </div>
    {editor && editValues && <Modal title="Let’s get the details right." wide onClose={() => { if (!busy) setEditor(false); }}><p className="modal-description">Correct anything here. A change means we’ll review the request again.</p><form onSubmit={saveEdits}><div className="edit-grid">{fieldNames.map(field => <div className={`edit-field ${['address', 'problem', 'work', 'conditions'].includes(field) ? 'full' : ''}`} key={field}><span>{fieldLabels[field]}{['budget', 'conditions'].includes(field) && <small>Optional</small>}</span>{field === 'conditions' ? <textarea aria-label={fieldLabels[field]} rows={3} value={editValues[field]} onChange={e => setEditValues({ ...editValues, [field]: e.target.value })} placeholder="One instruction per line" maxLength={6000} /> : field === 'visitTime' ? <div className="time-edit"><input type="time" aria-label="Requested time" value={editValues.visitTime === 'flexible' ? '' : editValues.visitTime} disabled={editValues.visitTime === 'flexible'} onChange={e => setEditValues({ ...editValues, visitTime: e.target.value })} /><label className="flexible-check"><input type="checkbox" checked={editValues.visitTime === 'flexible'} onChange={e => setEditValues({ ...editValues, visitTime: e.target.checked ? 'flexible' : '' })} />Flexible</label></div> : <input aria-label={fieldLabels[field]} type={field === 'visitDate' ? 'date' : field === 'budget' ? 'number' : field === 'phone' ? 'tel' : 'text'} min={field === 'visitDate' ? indianDate() : field === 'budget' ? 1 : undefined} max={field === 'budget' ? 1000000 : undefined} step={field === 'budget' ? 1 : undefined} maxLength={field === 'phone' ? 10 : 500} value={editValues[field]} onChange={e => setEditValues({ ...editValues, [field]: e.target.value })} />}</div>)}</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => setEditor(false)}>Cancel</button><button className="primary-button" disabled={Boolean(busy)}>Save corrections<Icon name="check" size={16} /></button></div></form></Modal>}
    {history && <Modal title="Saved requests" onClose={() => setHistory(false)}><p className="modal-description">Customer-confirmed requests saved in this browser session.</p>{state?.saved.length ? <div className="saved-list">{state.saved.map(item => <button key={item.id} className="saved-item" disabled={Boolean(busy)} onClick={() => run('Opening saved request', async () => { const data = await request<{ draft: Draft }>(`/saved/${item.id}`); setArchived(data.draft); setHistory(false); })}><span><strong>{item.name}</strong><small>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(item.createdAt))} · Version {item.version}</small></span><Icon name="arrow" size={18} /></button>)}</div> : <div className="empty-history"><Icon name="history" size={32} /><p>No pakki requests yet.</p><span>Review and confirm a request, and it will appear here.</span></div>}</Modal>}
    {source && evidence && <Modal title={`Source: ${fieldLabels[source]}`} onClose={() => setSource(null)}><span className="source-tag">{evidence.source === 'manual' ? 'Edited directly on the card' : evidence.source === 'sample' ? 'Saved example — not live speech' : evidence.source === 'voice' ? 'Original voice transcript' : 'Customer’s typed words'}</span>{evidence.quote ? <blockquote>{evidence.quote}</blockquote> : <p className="modal-description">You entered this value directly. Any earlier confirmation was reset when it changed.</p>}{evidenceTurn && sourceAudio.current.has(evidenceTurn.id) ? <audio onPlay={e => onlyAudio(e.currentTarget)} controls src={sourceAudio.current.get(evidenceTurn.id)} aria-label="Original source recording" /> : evidence.source === 'voice' && <p className="modal-description">The recording was kept only in the original browser tab. The transcript remains available.</p>}</Modal>}
    {archived && <Modal title="Confirmed request" wide onClose={() => setArchived(null)}><Printable draft={archived} /><div className="modal-actions"><button className="secondary-button" onClick={() => print(archived)}><Icon name="print" size={16} />Print / save as PDF</button></div></Modal>}
    <div className="print-only">{printDraft && <Printable draft={printDraft} />}</div>
  </>;
}
function Printable({ draft }: { draft: Draft }) {
  return <article className="printable"><div className="print-header"><h2>BaatPakki<span>.</span></h2><span>CUSTOMER-CONFIRMED REQUEST</span></div><p className="print-reference">Request #{draft.id.slice(0, 6).toUpperCase()} · Version {draft.version}</p><dl>{fieldNames.map(field => <div key={field}><dt>{fieldLabels[field]}</dt><dd>{field === 'conditions' && !draft.fields.conditions.length ? 'None stated' : displayValue(field, draft.fields[field])}</dd></div>)}</dl><p className="print-disclaimer">Customer confirmation records these instructions. The service team must separately accept the visit. The budget is a maximum limit, not a quoted price.</p><small>Confirmed {draft.confirmedAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(draft.confirmedAt)) : '—'} IST</small></article>;
}
