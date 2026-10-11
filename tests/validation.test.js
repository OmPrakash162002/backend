import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, validateClaim, findDuplicates, parseDate } from '../src/services/validation.js';
import { calculateTotals } from '../src/services/totals.js';
import { retrieveSections, scoreCategories } from '../src/services/retrieval.js';

const NOW = new Date('2026-10-11T10:00:00Z');
const base = { claimant: 'Asha', date: '2026-10-08', category: 'meals', amount: 1200, currency: 'INR', description: 'Team lunch after sprint review', receiptAvailable: true };
const asClaim = (o = {}) => ({ ...base, ...o, date: parseDate(o.date ?? base.date) });
const codes = (r) => r.issues.map((i) => i.code);

test('validateInput accepts a good claim and normalises values', () => {
  const { errors, value } = validateInput({ ...base, amount: '1200', currency: 'inr', receiptAvailable: 'yes' }, NOW);
  assert.equal(errors.length, 0);
  assert.equal(value.currency, 'INR');
  assert.equal(value.amount, 1200);
  assert.equal(value.receiptAvailable, true);
});

test('validateInput reports every missing or invalid field', () => {
  const { errors } = validateInput({ date: '2026-02-31', amount: -5, currency: 'XYZ', category: 'x' }, NOW);
  const fields = errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['amount', 'category', 'claimant', 'currency', 'date', 'description', 'receiptAvailable']);
});

test('validateInput rejects future dates', () => {
  const { errors } = validateInput({ ...base, date: '2026-12-01' }, NOW);
  assert.equal(errors[0].field, 'date');
});

test('missing receipt flagged above threshold but not below', () => {
  assert.ok(codes(validateClaim({ claim: asClaim({ receiptAvailable: false }), category: 'meals', now: NOW })).includes('MISSING_RECEIPT'));
  assert.ok(!codes(validateClaim({ claim: asClaim({ receiptAvailable: false, amount: 400 }), category: 'meals', now: NOW })).includes('MISSING_RECEIPT'));
});

test('per-claim limit uses base currency conversion', () => {
  const r = validateClaim({ claim: asClaim({ amount: 20, currency: 'USD' }), category: 'meals', now: NOW }); // 20 USD = 1680 INR > 1500
  assert.ok(codes(r).includes('OVER_LIMIT'));
  assert.equal(r.amountBase, 1680);
});

test('monthly limit accumulates earlier claims in the same category', () => {
  const peers = [{ _id: 'a1', date: '2026-10-02', amount: 1400, currency: 'INR', description: 'x', amountBase: 5000, effectiveCategory: 'meals' }];
  const r = validateClaim({ claim: asClaim({ amount: 1200 }), category: 'meals', peers, now: NOW });
  assert.ok(codes(r).includes('OVER_MONTHLY_LIMIT'));
  assert.equal(r.monthlyTotalBase, 6200);
});

test('stale claims and unresolved categories are flagged', () => {
  const r = validateClaim({ claim: asClaim({ date: '2026-07-01' }), category: 'unclassified', now: NOW });
  assert.ok(codes(r).includes('STALE_CLAIM'));
  assert.ok(codes(r).includes('CATEGORY_UNRESOLVED'));
});

test('duplicate detection: exact and possible', () => {
  const claim = asClaim();
  const peers = [
    { _id: 'e1', date: '2026-10-08', amount: 1200, currency: 'INR', description: 'something else' },
    { _id: 'p1', date: '2026-10-10', amount: 1200, currency: 'INR', description: 'different' },
    { _id: 'p2', date: '2026-10-09', amount: 99, currency: 'INR', description: 'Team lunch after sprint review' },
    { _id: 'n1', date: '2026-09-01', amount: 1200, currency: 'INR', description: 'Team lunch after sprint review' },
  ];
  const d = Object.fromEntries(findDuplicates(claim, peers).map((x) => [x.claimId, x.type]));
  assert.deepEqual(d, { e1: 'exact', p1: 'possible', p2: 'possible' });
});

test('calculateTotals excludes rejected claims from the grand total', () => {
  const t = calculateTotals([
    { claimant: 'A', status: 'approved', effectiveCategory: 'meals', amountBase: 1000.1 },
    { claimant: 'A', status: 'pending_review', effectiveCategory: 'meals', amountBase: 500.2 },
    { claimant: 'B', status: 'rejected', effectiveCategory: 'lodging', amountBase: 9999 },
  ]);
  assert.equal(t.grandTotalBase, 1500.3);
  assert.equal(t.byStatus.rejected.count, 1);
  assert.equal(t.byCategory.meals.count, 2);
  assert.equal(t.byClaimant.A.totalBase, 1500.3);
});

test('retrieval finds the right section and adds sections cited by validation issues', () => {
  assert.equal(retrieveSections({ description: 'Uber ride to the client office' , claimedCategory: 'other' })[0].id, 'GROUND-1');
  const ids = retrieveSections({ description: 'misc', claimedCategory: 'other', issues: [{ policyIds: ['GEN-RECEIPT'] }] }).map((s) => s.id);
  assert.ok(ids.includes('GEN-RECEIPT'));
  assert.equal(Object.entries(scoreCategories('Figma subscription')).sort((a, b) => b[1] - a[1])[0][0], 'software');
});
