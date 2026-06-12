import type { BundleFact, BundlePayload, CanonicalFact, SellableStatus } from './types';
import { isDemoSafe } from './types';
import { computeCoverage } from './coverage';

const BLOCKED_STATUS: SellableStatus[] = ['excluded', 'eol', 'low_stock'];

function productStatus(facts: CanonicalFact[], product: string): SellableStatus | null {
  const f = facts.find((x) => x.fact_key === `catalog.products.${product}.sellable_status`);
  if (!f) return null;
  try { return JSON.parse(f.canonical_value).status as SellableStatus; } catch { return null; }
}

function toBundleFact(f: CanonicalFact): BundleFact {
  return {
    fact_key: f.fact_key, section: f.section, value: f.canonical_value, confidence: f.canonical_confidence,
    min_privacy: f.min_privacy, freshness_status: f.freshness_status, source_refs: f.supporting_observation_ids,
  };
}

export function composeBlogBundle(facts: CanonicalFact[]): BundlePayload {
  const topicsFact = facts.find((f) => f.fact_key === 'blog.topic_candidates');
  const rawTopics: { topic: string; product?: string }[] = topicsFact ? JSON.parse(topicsFact.canonical_value) : [];
  const topic_candidates = rawTopics.map((t) => {
    const status = t.product ? productStatus(facts, t.product) : null;
    const blocked = !!status && BLOCKED_STATUS.includes(status);
    return { topic: t.topic, blocked, reason: blocked ? `product ${t.product} is ${status}` : 'eligible' };
  });

  return {
    facts: facts.map(toBundleFact),
    gaps: computeCoverage(facts.map((f) => f.fact_key)).missing,
    freshness_warnings: facts.filter((f) => f.freshness_status === 'stale').map((f) => f.fact_key),
    conflicts: facts.filter((f) => f.freshness_status === 'conflicted').map((f) => f.fact_key),
    locked_decisions: facts.filter((f) => f.operator_locked).map((f) => `${f.fact_key}=${f.canonical_value}`),
    open_questions: (() => { const q = facts.find((f) => f.fact_key === 'decisions.open_questions'); return q ? JSON.parse(q.canonical_value) : []; })(),
    topic_candidates,
  };
}

// Publish-safe subset: the ONLY fields safe to emit publicly (cited.md). Every
// privacy-sensitive field is filtered, not just `facts` — internal fact_keys and
// the reason a topic was blocked (e.g. "product cat6_flat is excluded") must never leak.
export function publishSafe(payload: BundlePayload): BundlePayload {
  // Curated `topic_candidates` supersedes the raw `blog.topic_candidates` aggregate,
  // which can name a product we curated out — never re-publish that raw fact.
  const publicFacts = payload.facts.filter(
    (f) => isDemoSafe(f.min_privacy) && f.fact_key !== 'blog.topic_candidates',
  );
  const publicFactKeys = new Set(publicFacts.map((f) => f.fact_key));
  return {
    ...payload,
    facts: publicFacts,
    locked_decisions: [], // internal by nature — never publish
    conflicts: [], // a conflict reveals an internal/external disagreement — never publish
    gaps: [], // the brain's blind spots are internal — never broadcast publicly
    freshness_warnings: payload.freshness_warnings.filter((k) => publicFactKeys.has(k)),
    open_questions: publicFactKeys.has('decisions.open_questions') ? payload.open_questions : [],
    topic_candidates: payload.topic_candidates
      .filter((t) => !t.blocked)
      .map((t) => ({ topic: t.topic, blocked: false, reason: 'eligible' })),
  };
}
