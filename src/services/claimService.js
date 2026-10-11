import Claim from '../models/Claim.js';
import AuditLog from '../models/AuditLog.js';
import { HttpError } from '../utils/httpError.js';
import { CATEGORIES } from '../config/policy.js';
import { validateInput, validateClaim } from './validation.js';
import { retrieveSections } from './retrieval.js';
import { analyseClaim, finalVerdict } from './ai.js';
import { calculateTotals } from './totals.js';
import { isReviewer, isOwner, toEmployeeView } from './access.js';

const DAY = 86_400_000;
const FINAL = ['approved', 'rejected'];
const SYSTEM = { name: 'system', role: 'system' };

const log = (claimId, action, user, details = {}) =>
  AuditLog.create({ claimId, action, actor: user.name, actorId: user._id, actorRole: user.role, details });

/** override > claimed category > confident AI classification > unclassified */
export function effectiveCategory(claim) {
  if (claim.override?.category) return claim.override.category;
  if (claim.category !== 'other') return claim.category;
  if (claim.ai && !claim.ai.uncertain && CATEGORIES[claim.ai.category]) return claim.ai.category;
  return 'unclassified';
}

async function loadPeers(claim) {
  const y = claim.date.getUTCFullYear();
  const m = claim.date.getUTCMonth();
  return Claim.find({
    _id: { $ne: claim._id },
    claimantKey: claim.claimantKey,
    status: { $ne: 'rejected' },
    date: { $gte: new Date(Date.UTC(y, m, 1) - 3 * DAY), $lt: new Date(Date.UTC(y, m + 1, 1) + 3 * DAY) },
  }).lean();
}

/** validate -> retrieve policy -> AI analysis -> (re-validate if AI settled the category) */
async function runPipeline(claim) {
  const peers = await loadPeers(claim);
  const now = new Date();
  const validate = (category) => validateClaim({ claim, category, peers, now });

  let category = effectiveCategory(claim);
  let v = validate(category);
  const retrieved = retrieveSections({ description: claim.description, claimedCategory: category, issues: v.issues });

  const ai = await analyseClaim({ claim, issues: v.issues, retrieved, clarifications: claim.clarifications });
  claim.ai = ai;

  const settled = effectiveCategory(claim);
  if (settled !== category) {
    category = settled;
    v = validate(category);
  }
  ai.verdict = finalVerdict(ai.verdict, v.issues, ai.uncertain);

  claim.effectiveCategory = category;
  claim.amountBase = v.amountBase;
  claim.validation = { issues: v.issues, duplicates: v.duplicates, monthlyTotalBase: v.monthlyTotalBase };
  claim.markModified('ai');
  claim.markModified('validation');
  return claim;
}

// ---------- access control ----------

/** Employees can only load their own claims. Anyone else's claim looks like it does not exist (404). */
async function load(id, user) {
  const claim = await Claim.findById(id);
  if (!claim || (!isReviewer(user) && !isOwner(claim, user))) throw new HttpError(404, 'Claim not found');
  return claim;
}

/** Only reviewers decide, and never on a claim they submitted themselves (separation of duties). */
function assertCanReview(claim, user) {
  if (!isReviewer(user)) throw new HttpError(403, 'Only reviewers can do this');
  if (isOwner(claim, user)) throw new HttpError(403, 'You cannot review your own claim');
}

function assertOpen(claim) {
  if (FINAL.includes(claim.status)) throw new HttpError(409, `Claim is already ${claim.status} and can no longer be changed`);
}

const needText = (value, label, min = 3) => {
  const t = String(value ?? '').trim();
  if (t.length < min) throw new HttpError(400, `${label} is required`);
  return t.slice(0, 1000);
};

const summarise = (claim) => ({
  source: claim.ai.source,
  category: claim.ai.category,
  confidence: claim.ai.confidence,
  uncertain: claim.ai.uncertain,
  verdict: claim.ai.verdict,
  issues: claim.validation.issues.map((i) => i.code),
  error: claim.ai.error,
});

// ---------- queries ----------

export async function getClaimDetail(id, user) {
  const claim = await load(id, user);
  const history = await AuditLog.find({ claimId: id }).sort({ at: 1, _id: 1 }).lean();
  return isReviewer(user) ? { claim, history } : toEmployeeView(claim.toObject(), history);
}

export async function listClaims(user, { status, q } = {}) {
  const filter = isReviewer(user) ? {} : { claimantId: user._id };
  if (status) filter.status = String(status);
  if (q) {
    const rx = new RegExp(String(q).slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ claimant: rx }, { description: rx }];
  }
  const query = Claim.find(filter).sort({ createdAt: -1 }).limit(200);
  return (isReviewer(user) ? query : query.select('-ai -override')).lean();
}

export async function getTotals(user) {
  const filter = isReviewer(user) ? {} : { claimantId: user._id };
  return calculateTotals(await Claim.find(filter, 'claimant status effectiveCategory amountBase').lean());
}

// ---------- commands ----------

export async function createClaim(raw, user) {
  // The claimant is always the signed-in user; any "claimant" in the request body is ignored.
  const { errors, value } = validateInput({ ...raw, claimant: user.name });
  if (errors.length) throw new HttpError(400, 'Claim validation failed', errors);

  const claim = new Claim({ ...value, claimantId: user._id, claimantKey: String(user._id), submittedBy: user.name });
  await runPipeline(claim);
  await claim.save();
  await log(claim._id, 'CLAIM_SUBMITTED', user, { amount: claim.amount, currency: claim.currency, category: claim.category });
  await log(claim._id, 'AI_ANALYSED', SYSTEM, summarise(claim));
  return getClaimDetail(claim._id, user);
}

export async function reanalyse(id, user) {
  const claim = await load(id, user);
  assertCanReview(claim, user);
  assertOpen(claim);
  await runPipeline(claim);
  await claim.save();
  await log(claim._id, 'REANALYSED', user, summarise(claim));
  return getClaimDetail(id, user);
}

export async function decide(id, action, { note } = {}, user) {
  const claim = await load(id, user);
  assertCanReview(claim, user);
  assertOpen(claim);
  const text = String(note ?? '').trim().slice(0, 1000);

  if (action === 'approve') {
    if (claim.clarifications.some((c) => !c.answer)) throw new HttpError(409, 'Resolve open clarification requests before approving');
    const hasErrors = claim.validation?.issues?.some((i) => i.severity === 'error');
    if (hasErrors && text.length < 5) throw new HttpError(400, 'A justification note is required to approve a claim with policy errors');
  } else if (text.length < 3) {
    throw new HttpError(400, 'A reason is required to reject a claim');
  }

  claim.status = action === 'approve' ? 'approved' : 'rejected';
  claim.decision = { action, note: text, by: user.name, byId: String(user._id), at: new Date() };
  await claim.save();
  await log(claim._id, action === 'approve' ? 'APPROVED' : 'REJECTED', user, { note: text, issues: claim.validation.issues.map((i) => i.code) });
  return getClaimDetail(id, user);
}

export async function overrideCategory(id, { category, reason } = {}, user) {
  const claim = await load(id, user);
  assertCanReview(claim, user);
  assertOpen(claim);
  if (!CATEGORIES[category]) throw new HttpError(400, 'Choose a valid policy category');
  const why = needText(reason, 'A reason for the override', 5);

  const before = claim.effectiveCategory;
  claim.override = { category, reason: why, by: user.name, byId: String(user._id), at: new Date(), previousCategory: before, aiCategory: claim.ai?.category ?? null };
  claim.markModified('override');
  await runPipeline(claim);
  await claim.save();
  await log(claim._id, 'CLASSIFICATION_OVERRIDDEN', user, { from: before, to: category, aiCategory: claim.override.aiCategory, reason: why });
  return getClaimDetail(id, user);
}

export async function requestClarification(id, { question } = {}, user) {
  const claim = await load(id, user);
  assertCanReview(claim, user);
  assertOpen(claim);
  const q = needText(question, 'A question');
  claim.clarifications.push({ question: q, askedBy: user.name });
  claim.status = 'needs_clarification';
  await claim.save();
  await log(claim._id, 'CLARIFICATION_REQUESTED', user, { question: q });
  return getClaimDetail(id, user);
}

/** Only the claimant answers questions about their own claim. */
export async function answerClarification(id, cid, { answer } = {}, user) {
  const claim = await load(id, user);
  if (!isOwner(claim, user)) throw new HttpError(403, 'Only the claimant can answer clarification requests');
  assertOpen(claim);
  const item = claim.clarifications.id(cid);
  if (!item) throw new HttpError(404, 'Clarification request not found');
  if (item.answer) throw new HttpError(409, 'This clarification has already been answered');

  item.answer = needText(answer, 'An answer');
  item.answeredBy = user.name;
  item.answeredAt = new Date();
  await log(claim._id, 'CLARIFICATION_ANSWERED', user, { question: item.question, answer: item.answer });

  if (!claim.clarifications.some((c) => !c.answer)) {
    claim.status = 'pending_review';
    await runPipeline(claim); // re-run so the AI can use the new information
    await log(claim._id, 'REANALYSED', SYSTEM, summarise(claim));
  }
  await claim.save();
  return getClaimDetail(id, user);
}
