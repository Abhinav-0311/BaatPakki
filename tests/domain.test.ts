import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, blankDraft, confirmDraft, getMissing, markReviewed, readback, indianDate, type Change } from '../shared/domain.ts';

const manual = (field: string, value: unknown): Change => ({ field, value, quote: '', source: 'manual' } as Change);
function complete() {
  return applyChanges(blankDraft('2026-11-06T10:00:00Z'), [
    manual('name', 'Aarav Sharma'), manual('phone', '9000000000'), manual('address', '203, Demo Apartments, Bhopal'),
    manual('problem', 'Cooling kam hai'), manual('work', 'AC servicing'), manual('visitDate', indianDate(new Date(Date.now() + 86400000))), manual('visitTime', '18:00'),
    manual('budget', 800), manual('conditions', ['Gas filling requires separate approval']),
  ]);
}
test('a corrected time replaces the earlier time without losing approval conditions', () => {
  const draft = complete();
  const result = applyChanges(draft, [{ field: 'visitTime', value: '19:00', quote: 'seven PM', source: 'voice' }], { id: 'turn-2', text: 'Actually seven PM please' });
  assert.equal(result.fields.visitTime, '19:00');
  assert.deepEqual(result.fields.conditions, draft.fields.conditions);
  assert.equal(result.evidence.visitTime?.turnId, 'turn-2');
});
test('unquoted changes reject the entire update and leave the old draft untouched', () => {
  const draft = complete();
  assert.throws(() => applyChanges(draft, [{ field: 'budget', value: 1500, quote: 'fifteen hundred', source: 'voice' }], { id: 'x', text: 'same budget please' }), /evidence/i);
  assert.equal(draft.fields.budget, 800);
});
test('AI cannot silently replace existing restrictions', () => {
  const draft = complete();
  assert.throws(() => applyChanges(draft, [{ field: 'conditions', value: [], quote: 'yes', source: 'voice' }], { id: 'x', text: 'yes' }), /restriction/i);
});
test('budget stays a validated maximum, and ambiguity prevents review', () => {
  assert.throws(() => applyChanges(blankDraft(), [manual('budget', -1)]), /budget/i);
  const draft = applyChanges(complete(), [manual('visitTime', null)]);
  assert.ok(getMissing(draft).some(x => x.field === 'visitTime'));
  assert.throws(() => markReviewed(draft, draft.version), /missing/i);
  assert.match(readback(complete()), /अधिकतम बजट 800 रुपये/);
  assert.doesNotMatch(readback(complete()), /service charge/i);
});
test('confirmation requires review of the current version and any edit resets it', () => {
  const draft = complete();
  assert.throws(() => confirmDraft(draft, draft.version), /review/i);
  const reviewed = markReviewed(draft, draft.version);
  assert.equal(confirmDraft(reviewed, reviewed.version).status, 'confirmed');
  const edited = applyChanges(reviewed, [manual('problem', 'Makes a rattling sound')]);
  assert.equal(edited.reviewedVersion, null);
  assert.throws(() => confirmDraft(edited, reviewed.version), /version|review/i);
});
test('yes-but is never treated as whole-request voice confirmation', () => {
  const reviewed = markReviewed(complete(), complete().version);
  assert.throws(() => confirmDraft(reviewed, reviewed.version, 'haan lekin Saturday ko'), /explicit/i);
  assert.equal(confirmDraft(reviewed, reviewed.version, 'हाँ सही है').status, 'confirmed');
});
test('invalid dates and ambiguous afternoon strings cannot be committed as a slot', () => {
  assert.throws(() => applyChanges(blankDraft(), [manual('visitDate', '2026-02-30')]), /date/i);
  assert.throws(() => applyChanges(blankDraft(), [manual('visitTime', 'six')]), /time/i);
});
