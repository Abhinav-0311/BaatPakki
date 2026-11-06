import { z } from 'zod';

const text = z.string().trim().min(1).max(500).nullable();
export const fieldSchemas = {
  name: z.string().trim().min(2).max(100).nullable(),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Use a 10-digit Indian mobile number').nullable(),
  address: z.string().trim().min(8).max(500).nullable(),
  problem: text,
  work: text,
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Use a valid date').nullable(),
  visitTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^flexible$/, 'Use a specific time or flexible').nullable(),
  budget: z.number().int().min(1).max(1_000_000).nullable(),
  conditions: z.array(z.string().trim().min(1).max(300)).max(20),
};
export const fieldsSchema = z.object(fieldSchemas).strict();
export type Fields = z.infer<typeof fieldsSchema>;
export type Field = keyof Fields;
export type OpenQuestion = { field: Field | null; message: string };
export const fieldNames = Object.keys(fieldSchemas) as Field[];
export const fieldLabels: Record<Field, string> = {
  name: 'Customer name', phone: 'Callback number', address: 'Service address', problem: 'What needs attention',
  work: 'Requested work', visitDate: 'Requested date', visitTime: 'Requested time', budget: 'Maximum budget', conditions: 'Approval & instructions',
};
export type Source = 'voice' | 'text' | 'manual' | 'sample';
export type Change = { field: Field; value: string | number | string[] | null; quote: string; source: Source };
export type Evidence = { turnId: string | null; quote: string; source: Source };
export type Turn = { id: string; text: string; source: Source; createdAt: string; reply: string };
export type Draft = {
  id: string; createdAt: string; version: number; fields: Fields;
  evidence: Partial<Record<Field, Evidence>>;
  reviewedVersion: number | null; confirmedAt: string | null; status: 'draft' | 'confirmed';
};

export function blankDraft(now = new Date().toISOString()): Draft {
  return {
    id: crypto.randomUUID(), createdAt: now, version: 0,
    fields: { name: null, phone: null, address: null, problem: null, work: null, visitDate: null, visitTime: null, budget: null, conditions: [] },
    evidence: {}, reviewedVersion: null, confirmedAt: null, status: 'draft',
  };
}
const normalise = (text: string) => text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

export function applyChanges(draft: Draft, changes: Change[], turn?: { id: string; text: string }): Draft {
  const result = structuredClone(draft);
  for (const change of changes) {
    if (!fieldNames.includes(change.field)) throw new Error('Unknown job-card field');
    let value: Fields[Field];
    try { value = fieldSchemas[change.field].parse(change.value); }
    catch { throw new Error(`Please check ${change.field}: the value is invalid.`); }
    if (change.source !== 'manual') {
      if (!turn || !change.quote.trim() || !normalise(turn.text).includes(normalise(change.quote))) {
        throw new Error(`Missing or invalid transcript evidence for ${change.field}. Your draft was kept.`);
      }
      if (change.field === 'conditions') {
        const proposed = value as string[];
        if (result.fields.conditions.length && !proposed.length) throw new Error('Remove a restriction explicitly in the card editor.');
        value = [...new Set([...result.fields.conditions, ...proposed])];
      }
    }
    (result.fields as Record<string, unknown>)[change.field] = value;
    result.evidence[change.field] = { turnId: turn?.id ?? null, quote: change.quote, source: change.source };
  }
  fieldsSchema.parse(result.fields);
  if (JSON.stringify(result.fields) !== JSON.stringify(draft.fields)) {
    result.version++;
    result.status = 'draft'; result.reviewedVersion = null; result.confirmedAt = null;
  }
  return result;
}

const prompts: Partial<Record<Field, string>> = {
  name: 'आपका नाम क्या है? / What name should we put on the request?',
  phone: 'किस मोबाइल नंबर पर संपर्क करें? / What is your callback number?',
  address: 'सर्विस का पूरा पता बताइए। / What is the service address?',
  problem: 'AC में क्या परेशानी है? / What needs attention?',
  work: 'आप सर्विसिंग चाहते हैं या केवल जाँच? / What work would you like?',
  visitDate: 'आप किस तारीख को विज़िट चाहते हैं? / Which date works for you?',
  visitTime: 'कितने बजे? सुबह या शाम भी बताइए। समय तय नहीं है तो flexible कहिए। / What time, including AM or PM?',
};
export function getMissing(draft: Draft): { field: Field; question: string }[] {
  return (['problem', 'work', 'visitDate', 'visitTime', 'address', 'name', 'phone'] as Field[])
    .filter(field => !draft.fields[field])
    .map(field => ({ field, question: prompts[field]! }));
}
export function indianDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function formatDate(value: string | null): string {
  if (!value) return 'Not specified';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${value}T12:00:00+05:30`));
}
export function formatTime(value: string | null): string {
  if (!value) return 'Not specified';
  if (value === 'flexible') return 'Flexible';
  const [h, m] = value.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function readback(draft: Draft): string {
  const f = draft.fields;
  return [
    `${f.name || 'ग्राहक'}, आपकी AC सर्विस रिक्वेस्ट की जानकारी यह है।`,
    `परेशानी: ${f.problem || 'अभी बताना है'}। काम: ${f.work || 'अभी तय करना है'}।`,
    `विज़िट की पसंद: ${f.visitDate ? formatDate(f.visitDate) : 'तारीख अभी तय नहीं'}${f.visitTime ? `, ${formatTime(f.visitTime)}` : ''}।`,
    `पता: ${f.address || 'अभी बताना है'}। संपर्क नंबर: ${f.phone ? f.phone.split('').join(' ') : 'अभी बताना है'}।`,
    f.budget !== null ? `आपका अधिकतम बजट ${f.budget} रुपये है। यह सर्विस की तय कीमत नहीं है।` : 'बजट सीमा नहीं बताई गई है।',
    f.conditions.length ? `आपकी शर्तें: ${f.conditions.join('। ')}।` : 'अतिरिक्त शर्तें नहीं बताई गई हैं।',
    'यह आपकी रिक्वेस्ट की पुष्टि है। विज़िट को सर्विस टीम अलग से स्वीकार करेगी। क्या सभी जानकारी सही है?',
  ].join(' ');
}
export function markReviewed(draft: Draft, version: number): Draft {
  if (version !== draft.version) throw new Error('The draft version changed. Please review it again.');
  if (getMissing(draft).length) throw new Error('There are missing details. Complete the card before review.');
  if (draft.fields.visitDate! < indianDate()) throw new Error('The requested date is in the past. Please choose a new date.');
  return { ...draft, reviewedVersion: draft.version };
}
export function confirmDraft(draft: Draft, version: number, voiceText?: string): Draft {
  if (voiceText !== undefined && !/^(yes|yes correct|yes confirm|confirm|haan|haan sahi hai|हाँ|हां|हाँ सही है|हां सही है)[.!।\s]*$/iu.test(voiceText.trim())) {
    throw new Error('Please use explicit confirmation, or review your correction first.');
  }
  if (version !== draft.version || draft.reviewedVersion !== draft.version) throw new Error('Review the current version before confirming.');
  if (getMissing(draft).length) throw new Error('Complete the missing details before confirming.');
  if (draft.fields.visitDate! < indianDate()) throw new Error('The requested date is in the past. Please review a new date.');
  return { ...draft, status: 'confirmed', confirmedAt: new Date().toISOString() };
}
