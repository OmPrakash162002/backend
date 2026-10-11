// Deterministic validation. No AI, no database access: everything here is a pure function,
// so it is easy to unit test and its results are always reproducible.
import { POLICY, CATEGORIES, CLAIMABLE_CATEGORIES } from '../config/policy.js';

const DAY = 86_400_000;
const money = (n) => `${POLICY.baseCurrency} ${n.toLocaleString('en-IN')}`;
const monthKey = (d) => d.toISOString().slice(0, 7);

export function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null; // rejects 2026-02-31
  return d;
}

export function toBase(amount, currency) {
  const rate = POLICY.rates[currency];
  return rate === undefined ? null : Math.round(amount * rate * 100) / 100;
}

const tokens = (text) =>
  new Set(String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

export function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Required fields and basic type/date checks. Returns { errors, value }. */
export function validateInput(raw = {}, now = new Date()) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });

  const claimant = String(raw.claimant ?? '').trim();
  if (!claimant) add('claimant', 'Claimant is required');
  else if (claimant.length > 100) add('claimant', 'Claimant must be 100 characters or fewer');

  let date = null;
  if (!raw.date) add('date', 'Date is required');
  else {
    date = parseDate(raw.date);
    if (!date) add('date', 'Date must be a real calendar date in YYYY-MM-DD format');
    else if (date.getTime() > now.getTime() + DAY) add('date', 'Date cannot be in the future');
  }

  const category = String(raw.category ?? '').trim();
  if (!category) add('category', 'Category is required');
  else if (!CLAIMABLE_CATEGORIES.includes(category)) add('category', `Unknown category "${category}"`);

  const amount = typeof raw.amount === 'string' && raw.amount.trim() !== '' ? Number(raw.amount) : raw.amount;
  if (!Number.isFinite(amount) || amount <= 0) add('amount', 'Amount must be a number greater than 0');
  else if (amount > 10_000_000) add('amount', 'Amount is unrealistically large');

  const currency = String(raw.currency ?? '').trim().toUpperCase();
  if (!currency) add('currency', 'Currency is required');
  else if (POLICY.rates[currency] === undefined)
    add('currency', `Unsupported currency. Supported: ${Object.keys(POLICY.rates).join(', ')}`);

  const description = String(raw.description ?? '').trim();
  if (!description) add('description', 'Description is required');
  else if (description.length < 5) add('description', 'Description must be at least 5 characters');
  else if (description.length > 500) add('description', 'Description must be 500 characters or fewer');

  let receiptAvailable = raw.receiptAvailable;
  if (typeof receiptAvailable === 'string')
    receiptAvailable = { yes: true, true: true, no: false, false: false }[receiptAvailable.toLowerCase()];
  if (typeof receiptAvailable !== 'boolean') add('receiptAvailable', 'Receipt available must be yes or no');

  if (errors.length) return { errors, value: null };
  return {
    errors,
    value: { claimant, date, category, amount: Math.round(amount * 100) / 100, currency, description, receiptAvailable },
  };
}

/** Compare a claim with the claimant's other claims. Peers: { _id, date, amount, currency, description }. */
export function findDuplicates(claim, peers) {
  const out = [];
  for (const p of peers) {
    const days = Math.abs(claim.date.getTime() - new Date(p.date).getTime()) / DAY;
    const sameAmount = p.amount === claim.amount && p.currency === claim.currency;
    const similar = similarity(claim.description, p.description) >= 0.8;
    let type = null;
    if (days === 0 && sameAmount) type = 'exact';
    else if (days <= POLICY.duplicateWindowDays && (sameAmount || similar)) type = 'possible';
    if (type) out.push({ claimId: String(p._id), type, date: new Date(p.date).toISOString().slice(0, 10), amount: p.amount, currency: p.currency });
  }
  return out;
}

const issue = (code, severity, message, policyIds = [], field) => ({ code, severity, message, policyIds, field });

/**
 * Policy checks that do not need AI.
 * claim: { date: Date, amount, currency, description, receiptAvailable }
 * category: the effective category (a CATEGORIES key, or "unclassified")
 * peers: the claimant's other non-rejected claims near this date (each with amountBase, effectiveCategory)
 */
export function validateClaim({ claim, category, peers = [], now = new Date() }) {
  const issues = [];
  const amountBase = toBase(claim.amount, claim.currency);
  const shortId = (id) => String(id).slice(-6);

  if (amountBase > POLICY.receiptThresholdBase && !claim.receiptAvailable)
    issues.push(issue('MISSING_RECEIPT', 'error',
      `No receipt provided, but a receipt is required above ${money(POLICY.receiptThresholdBase)}.`, ['GEN-RECEIPT'], 'receiptAvailable'));

  const ageDays = Math.floor((now.getTime() - claim.date.getTime()) / DAY);
  if (ageDays > POLICY.maxClaimAgeDays)
    issues.push(issue('STALE_CLAIM', 'error',
      `Expense is ${ageDays} days old; claims must be submitted within ${POLICY.maxClaimAgeDays} days.`, ['GEN-TIMELY'], 'date'));

  if (amountBase > POLICY.preApprovalThresholdBase)
    issues.push(issue('PRE_APPROVAL_REQUIRED', 'warning',
      `Amount exceeds ${money(POLICY.preApprovalThresholdBase)}; written pre-approval is required.`, ['GEN-PREAPPROVAL'], 'amount'));

  let monthlyTotalBase = null;
  const cfg = CATEGORIES[category];
  if (!cfg) {
    issues.push(issue('CATEGORY_UNRESOLVED', 'error',
      'The expense category is not settled, so category limits could not be checked.', [], 'category'));
  } else {
    if (amountBase > cfg.perClaimLimit)
      issues.push(issue('OVER_LIMIT', 'error',
        `${money(amountBase)} exceeds the ${cfg.label} per-claim limit of ${money(cfg.perClaimLimit)}.`, [cfg.sectionId], 'amount'));
    const sameMonth = monthKey(claim.date);
    const prior = peers
      .filter((p) => p.effectiveCategory === category && monthKey(new Date(p.date)) === sameMonth)
      .reduce((sum, p) => sum + (p.amountBase || 0), 0);
    monthlyTotalBase = Math.round((prior + amountBase) * 100) / 100;
    if (monthlyTotalBase > cfg.monthlyLimit)
      issues.push(issue('OVER_MONTHLY_LIMIT', 'error',
        `${cfg.label} total for ${sameMonth} would be ${money(monthlyTotalBase)}, above the monthly limit of ${money(cfg.monthlyLimit)}.`, [cfg.sectionId], 'amount'));
  }

  const duplicates = findDuplicates(claim, peers);
  for (const d of duplicates) {
    if (d.type === 'exact')
      issues.push(issue('DUPLICATE', 'error',
        `Same claimant, date, amount and currency as claim …${shortId(d.claimId)}.`, ['GEN-DUP']));
    else
      issues.push(issue('POSSIBLE_DUPLICATE', 'warning',
        `Similar to claim …${shortId(d.claimId)} (${d.date}, ${d.amount} ${d.currency}).`, ['GEN-DUP']));
  }

  return { issues, amountBase, duplicates, monthlyTotalBase };
}
