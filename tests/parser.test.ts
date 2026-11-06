import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../server/parser.ts';
import { applyChanges, blankDraft } from '../shared/domain.ts';
import { spokenCorrection, approvalInstruction, periodReplies } from './fixtures/time-correction.ts';

const now = new Date('2026-11-06T10:00:00Z');
function parse(text: string) {
  const draft = blankDraft(now.toISOString());
  const proposal = parseRequest(text, draft, [], now);
  return { proposal, draft: applyChanges(draft, proposal.changes.map(c => ({ ...c, source: 'text' })), { id: 'turn', text }) };
}
test('guided parser handles Hinglish corrections, budget and approval without a text-model key', () => {
  const { draft } = parse('AC cooling kam hai. Servicing kal chaar baje, sorry shaam chhe baje. Gas bharne se pehle mujhe call karke approval lena. Budget aath sau hai.');
  assert.equal(draft.fields.visitDate, '2026-11-07');
  assert.equal(draft.fields.visitTime, '18:00');
  assert.equal(draft.fields.budget, 800);
  assert.match(draft.fields.problem!, /cooling/i);
  assert.match(draft.fields.conditions.join(' '), /approval/i);
});
test('guided parser understands Devanagari digits and Hindi appointment language', () => {
  const { draft } = parse('एसी की कूलिंग कम है। कल शाम ६ बजे सर्विसिंग चाहिए। बजट ८०० रुपये है। गैस भरने से पहले अनुमति लेना।');
  assert.equal(draft.fields.visitDate, '2026-11-07');
  assert.equal(draft.fields.visitTime, '18:00');
  assert.equal(draft.fields.budget, 800);
  assert.ok(draft.fields.conditions.length);
});
test('a bare six needs AM/PM and two unqualified alternatives need clarification', () => {
  const first = parse('Kal chhe baje servicing chahiye');
  assert.equal(first.draft.fields.visitTime, null);
  assert.ok(first.proposal.question);
  const second = parse('Tomorrow at 4 PM or 6 PM');
  assert.equal(second.draft.fields.visitTime, null);
  assert.ok(second.proposal.question);
});
test('identity and explicit address remain grounded in the exact text', () => {
  const { draft } = parse('Mera naam Aarav Sharma hai. Number 9000000000. Address Flat 203, Demo Apartments, Bhopal.');
  assert.equal(draft.fields.name, 'Aarav Sharma');
  assert.equal(draft.fields.phone, '9000000000');
  assert.equal(draft.fields.address, 'Flat 203, Demo Apartments, Bhopal');
});
test('a prohibition is kept and low cooling never becomes gas filling', () => {
  const { draft } = parse('AC cooling kam hai. Gas mat bharna. Sirf inspection karna.');
  assert.match(draft.fields.conditions.join(' '), /Gas mat bharna/i);
  assert.doesNotMatch(draft.fields.work || '', /gas filling/i);
});
test('unknown phrases and requests to remove an approval restriction are not guessed', () => {
  assert.deepEqual(parse('wahi kar dena jo last time hua tha').proposal.changes, []);
  assert.ok(parse('Gas ke liye approval ki zarurat nahi').proposal.question);
});
test('real Prisma comma-separated output keeps symptoms and approval instructions separate', () => {
  const { draft } = parse('AC की cooling कम है, कल शाम 6 बजे servicing चाहिए, budget 800 रुपये है, gas भरने से पहले अनुमति लेना।');
  assert.equal(draft.fields.problem, 'AC की cooling कम है');
  assert.deepEqual(draft.fields.conditions, ['gas भरने से पहले अनुमति लेना']);
  assert.equal(draft.fields.budget, 800);
});
test('unrelated negation cannot settle time alternatives, including 24-hour alternatives', () => {
  for (const text of ['4 PM or 6 PM. Gas nahi bharna.', '4 PM. Gas nahi bharna. 6 PM', '18:00 or 20:00']) {
    const result = parse(text); assert.equal(result.draft.fields.visitTime, null); assert.ok(result.proposal.question);
  }
});
test('date corrections use the corrected date and date alternatives require clarification', () => {
  assert.equal(parse('Tomorrow, actually today').draft.fields.visitDate, '2026-11-06');
  const result = parse('Tomorrow or Monday'); assert.equal(result.draft.fields.visitDate, null); assert.ok(result.proposal.question);
});
test('budget extraction cannot consume unrelated flat numbers or a following appointment', () => {
  assert.equal(parse('Budget 800 at Flat 9999').draft.fields.budget, 800);
  assert.equal(parse('Budget 800 till 7 PM').draft.fields.budget, 800);
  const result = parse('Budget 1.5 lakh'); assert.ok(result.draft.fields.budget === 150000 || result.proposal.question);
  assert.notEqual(result.draft.fields.budget, 1);
});
test('general prohibitions are preserved and unsupported clauses require explicit checking', () => {
  const result = parse('Tomorrow at 7 PM. Do not enter without calling me.');
  assert.ok(result.draft.fields.conditions.some(s => s.includes('Do not enter without calling me')) || result.proposal.question);
  assert.ok(parse('Tomorrow at 7 PM. Leave the receipt with the neighbour.').proposal.question);
});

test('the reported Hindi correction keeps the evening, budget and real approval instruction', () => {
  const { draft, proposal } = parse(spokenCorrection);
  assert.equal(draft.fields.visitTime, '19:00');
  assert.equal(draft.fields.budget, 800);
  assert.deepEqual(draft.fields.conditions, [approvalInstruction]);
  assert.equal(proposal.question, null);
});

test('PM-only follow-ups qualify a single pending clock without treating English I am as AM', () => {
  for (const reply of periodReplies) {
    const first = parse('7:00 बजे आना।');
    const turns = [{ id: 'first', text: '7:00 बजे आना।', source: 'voice' as const, createdAt: now.toISOString(), reply: first.proposal.question! }];
    const proposal = parseRequest(reply, first.draft, turns, now);
    const next = applyChanges(first.draft, proposal.changes.map(c => ({ ...c, source: 'voice' as const })), { id: 'reply', text: reply });
    assert.equal(next.fields.visitTime, '19:00', reply);
    assert.equal(proposal.question, null, reply);
    assert.deepEqual(next.fields.conditions, []);
  }
});

test('a meridiem reply cannot choose between different pending clock alternatives', () => {
  for (const text of ['4 PM or 6 PM', '4 baje ya 6 baje']) {
    const first = parse(text);
    const proposal = parseRequest('PM', first.draft, [{ id: 'first', text, source: 'text', createdAt: now.toISOString(), reply: first.proposal.question! }], now);
    assert.equal(proposal.changes.find(c => c.field === 'visitTime')?.value ?? null, null);
    assert.equal(proposal.questionField, 'visitTime');
    assert.ok(proposal.question);
  }
});

test('Hindi work prohibitions remain restrictions rather than time corrections', () => {
  assert.deepEqual(parse('काम मत करना।').draft.fields.conditions, ['काम मत करना']);
});
