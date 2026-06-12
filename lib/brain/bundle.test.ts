import { describe, it, expect } from 'vitest';
import { composeBlogBundle, publishSafe } from './bundle';
import type { CanonicalFact } from './types';

const fact = (fact_key: string, value: unknown, min_privacy: CanonicalFact['min_privacy'] = 'public_demo_safe', extra: Partial<CanonicalFact> = {}): CanonicalFact => ({
  merchant_id: 'gearit', fact_key, section: fact_key.split('.')[0], canonical_value: JSON.stringify(value),
  canonical_confidence: 0.9, supporting_observation_ids: ['o1'], conflicting_observation_ids: [],
  min_privacy, last_updated_at: 'now', last_brain_version_id: 'bv', freshness_status: 'fresh',
  operator_locked: false, expires_at: null, review_status: 'auto_accepted', ...extra,
});

describe('bundle', () => {
  it('blocks a topic referencing an excluded product', () => {
    const facts = [
      fact('catalog.products.cat6_flat.sellable_status', { status: 'excluded' }, 'internal_only', { operator_locked: true, freshness_status: 'operator_locked' }),
      fact('blog.topic_candidates', [{ topic: 'best flat Cat6 ethernet cables', product: 'cat6_flat' }, { topic: 'Cat6 outdoor direct-burial guide', product: 'cat6_outdoor' }]),
    ];
    const b = composeBlogBundle(facts);
    const blocked = b.topic_candidates.find((t) => t.topic.includes('flat Cat6'));
    const ok = b.topic_candidates.find((t) => t.topic.includes('direct-burial'));
    expect(blocked?.blocked).toBe(true);
    expect(ok?.blocked).toBe(false);
  });

  it('publishSafe drops non-public facts', () => {
    const b = composeBlogBundle([
      fact('identity.display_name', 'GEARit', 'public_demo_safe'),
      fact('catalog.products.cat6_flat.sellable_status', { status: 'excluded' }, 'internal_only'),
    ]);
    const pub = publishSafe(b);
    expect(pub.facts.every((f) => f.min_privacy === 'public_demo_safe')).toBe(true);
    expect(pub.facts.some((f) => f.fact_key.includes('cat6_flat'))).toBe(false);
  });
});
