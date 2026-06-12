// The fact areas a v0 merchant brain aims to know (spec §3 — "v0 fact_keys, ~12,
// scoped"). Coverage against this list is what makes "the brain got smarter" a
// number that moves: known/total rises as research and write-back actions fire.

export interface FactTarget { id: string; label: string; match: (factKey: string) => boolean; }
export interface CoverageTarget { id: string; label: string; covered: boolean; }
export interface Coverage { known: number; total: number; missing: string[]; targets: CoverageTarget[]; }

const exact = (key: string) => (factKey: string) => factKey === key;

export const TARGET_FACT_KEYS: FactTarget[] = [
  { id: 'identity.display_name', label: 'Brand identity', match: exact('identity.display_name') },
  { id: 'markets.primary_country', label: 'Primary market', match: exact('markets.primary_country') },
  { id: 'catalog.priority_categories', label: 'Priority categories', match: exact('catalog.priority_categories') },
  // Per-SKU key: covered once we know the stock status of at least one product.
  { id: 'catalog.products.sellable_status', label: 'Product stock status', match: (fk) => /^catalog\.products\..+\.sellable_status$/.test(fk) },
  { id: 'catalog.source_of_truth', label: 'Catalog source of truth', match: exact('catalog.source_of_truth') },
  { id: 'buyer_language.common_objections', label: 'Buyer objections', match: exact('buyer_language.common_objections') },
  { id: 'query.target_gaps', label: 'Target query gaps', match: exact('query.target_gaps') },
  { id: 'citation.cited_domains', label: 'Cited domains', match: exact('citation.cited_domains') },
  { id: 'blog.topic_candidates', label: 'Blog topics', match: exact('blog.topic_candidates') },
  { id: 'blog.proprietary_claim_candidates', label: 'Proprietary claims', match: exact('blog.proprietary_claim_candidates') },
  { id: 'decisions.open_questions', label: 'Open questions', match: exact('decisions.open_questions') },
  { id: 'schema.platform_constraints', label: 'Platform constraints', match: exact('schema.platform_constraints') },
];

export function computeCoverage(factKeys: string[]): Coverage {
  const targets = TARGET_FACT_KEYS.map((t) => ({ id: t.id, label: t.label, covered: factKeys.some((k) => t.match(k)) }));
  const known = targets.filter((t) => t.covered).length;
  return { known, total: targets.length, missing: targets.filter((t) => !t.covered).map((t) => t.id), targets };
}
