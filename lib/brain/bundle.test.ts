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

  it('publishSafe never leaks internal fact_keys, blocked-topic reasons, or conflicts', () => {
    const b = composeBlogBundle([
      fact('identity.display_name', 'GEARit', 'public_demo_safe'),
      fact('catalog.products.cat6_flat.sellable_status', { status: 'excluded' }, 'internal_only', { freshness_status: 'conflicted' }),
      fact('catalog.products.secret_sku.sellable_status', { status: 'excluded' }, 'internal_only', { freshness_status: 'stale' }),
      fact('internal.margin_notes', 'do-not-publish', 'internal_only', { freshness_status: 'missing' }),
      fact('blog.topic_candidates', [
        { topic: 'best flat Cat6 ethernet cables', product: 'cat6_flat' },
        { topic: 'Cat6 outdoor direct-burial guide', product: 'cat6_outdoor' },
      ]),
    ]);
    const pub = publishSafe(b);
    // No internal key/value token appears anywhere in the serialized public payload.
    const blob = JSON.stringify(pub);
    for (const leak of ['cat6_flat', 'secret_sku', 'margin_notes', 'do-not-publish', 'excluded']) {
      expect(blob).not.toContain(leak);
    }
    // Blocked topics are dropped entirely; survivors carry a neutral reason.
    expect(pub.topic_candidates.every((t) => t.blocked === false && t.reason === 'eligible')).toBe(true);
    expect(pub.topic_candidates.some((t) => t.topic.includes('flat Cat6'))).toBe(false);
    // Internal channels are emptied / key-filtered.
    expect(pub.conflicts).toEqual([]);
    expect(pub.locked_decisions).toEqual([]);
    expect(pub.gaps).toEqual([]);
    expect(pub.freshness_warnings).toEqual([]);
  });
});
