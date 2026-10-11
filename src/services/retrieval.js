// Policy retrieval: a small keyword index over the policy sections.
// Deterministic and explainable. For a large policy you could swap this for embeddings/Atlas Vector Search.
import { SECTIONS, CATEGORIES, sectionById } from '../config/policy.js';

const STOP = new Set('the and for with from that this was were are our their his her has have had you your about into over per out all any one two new use used paid pay'.split(' '));

export const tokenize = (text) =>
  String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

// "lunches" ~ "lunch", "rides" ~ "ride": prefix match once both words have 4+ letters
const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

const INDEX = SECTIONS.filter((s) => s.category !== 'general').map((s) => ({
  section: s,
  keywords: s.keywords,
  words: new Set(tokenize(`${s.title} ${s.text}`)),
}));

function baseScores(description) {
  const q = [...new Set(tokenize(description))];
  return INDEX.map(({ section, keywords, words }) => {
    let kw = 0;
    let tx = 0;
    for (const w of q) {
      if (keywords.some((k) => same(w, k))) kw += 1;
      else if (words.has(w)) tx += 1;
    }
    return { section, score: kw * 3 + tx };
  });
}

/** Score per category from the description alone (used by the rules-based fallback classifier). */
export function scoreCategories(description) {
  const out = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, 0]));
  for (const { section, score } of baseScores(description)) out[section.category] += score;
  return out;
}

/** Sections relevant to a claim: best keyword matches + every section cited by a validation issue. */
export function retrieveSections({ description, claimedCategory, issues = [], limit = 4 }) {
  const picked = new Map();
  baseScores(description)
    .map(({ section, score }) => ({ section, score: score + (section.category === claimedCategory ? 4 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .forEach(({ section, score }) => picked.set(section.id, { ...section, score, reason: 'keyword/category match' }));

  for (const id of issues.flatMap((i) => i.policyIds || [])) {
    const s = sectionById(id);
    if (s && !picked.has(id)) picked.set(id, { ...s, score: 0, reason: 'cited by validation' });
  }
  // Prohibited-items rule is always worth showing when its keywords appear
  const personal = baseScoreFor('GEN-PERSONAL', description);
  if (personal && !picked.has('GEN-PERSONAL')) picked.set('GEN-PERSONAL', { ...sectionById('GEN-PERSONAL'), score: personal, reason: 'keyword match' });
  return [...picked.values()];
}

function baseScoreFor(id, description) {
  const s = sectionById(id);
  const q = tokenize(description);
  return q.filter((w) => s.keywords.some((k) => same(w, k))).length * 3;
}
