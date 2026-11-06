import { DatabaseSync } from 'node:sqlite';
import type { Draft, Turn, Field } from '../shared/domain.ts';
import { blankDraft } from '../shared/domain.ts';

export type SessionState = { draft: Draft; turns: Turn[]; question: string | null; pendingField?: Field | null; sampleStep: number | null };
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, session TEXT NOT NULL, request TEXT NOT NULL, version INTEGER NOT NULL, snapshot TEXT NOT NULL, UNIQUE(session, request, version));`);
  }
  get(session: string): SessionState {
    const row = this.db.prepare('SELECT state FROM sessions WHERE id=?').get(session) as { state: string } | undefined;
    return row ? JSON.parse(row.state) : { draft: blankDraft(), turns: [], question: null, sampleStep: null };
  }
  set(session: string, state: SessionState) {
    this.db.prepare('INSERT INTO sessions(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(session, JSON.stringify(state));
  }
  save(session: string, draft: Draft) {
    this.db.prepare('INSERT OR IGNORE INTO cards(id,session,request,version,snapshot) VALUES(?,?,?,?,?)').run(crypto.randomUUID(), session, draft.id, draft.version, JSON.stringify(draft));
  }
  list(session: string) {
    return (this.db.prepare('SELECT id,snapshot FROM cards WHERE session=? ORDER BY rowid DESC LIMIT 50').all(session) as { id: string; snapshot: string }[])
      .map(row => { const draft = JSON.parse(row.snapshot) as Draft; return { id: row.id, name: draft.fields.name, createdAt: draft.confirmedAt, version: draft.version }; });
  }
  saved(session: string, id: string): Draft | null {
    const row = this.db.prepare('SELECT snapshot FROM cards WHERE id=? AND session=?').get(id, session) as { snapshot: string } | undefined;
    return row ? JSON.parse(row.snapshot) : null;
  }
  close() { this.db.close(); }
}
