import { describe, it, expect } from 'vitest';
import { synthesizeFact } from './synthesize';
import type { CanonicalFact, Observation } from './types';

const FK = 'catalog.products.cat6_flat.sellable_status';
const obs = (id: string, value: string, p: Observation['privacy_class'], d: Observation['directness'], conf = 0.9): Observation => ({
  merchant_id: 'gearit', observation_id: id, source_id: 's_' + id, fact_key: FK,
  observation_type: 'product_status', claim: value, structured_value: JSON.stringify({ status: value }),
  extraction_confidence: conf, directness: d, evidence_ref: 'ref', privacy_class: p,
  observed_at: '2026-06-12 10:00:00.000', extraction_method: 'llm', review_status: 'auto_accepted',
});

describe('synthesizeFact', () => {
  it('sets conflicted when web(sellable) meets internal(excluded), min_privacy is internal_only', () => {
    const { fact } = synthesizeFact(null, [
      obs('w', 'sellable', 'public_demo_safe', 'direct'),
      obs('i', 'excluded', 'internal_only', 'direct'),
    ], { fact_key: FK, section: 'catalog', brain_version_id: 'bv1', now: '2026-06-12 11:00:00.000' });
    expect(fact.freshness_status).toBe('conflicted');
    expect(fact.min_privacy).toBe('internal_only');
    expect(fact.conflicting_observation_ids.sort()).toEqual(['i', 'w']);
  });

  it('derived observation cannot raise confidence above current', () => {
    const current: CanonicalFact = {
      merchant_id: 'gearit', fact_key: FK, section: 'catalog', canonical_value: JSON.stringify({ status: 'sellable' }),
      canonical_confidence: 0.6, supporting_observation_ids: ['x'], conflicting_observation_ids: [],
      min_privacy: 'public_demo_safe', last_updated_at: '2026-06-12 09:00:00.000', last_brain_version_id: 'bv0',
      freshness_status: 'fresh', operator_locked: false, expires_at: null, review_status: 'auto_accepted',
    };
    const { fact } = synthesizeFact(current, [obs('d', 'sellable', 'public_demo_safe', 'derived', 0.99)],
      { fact_key: FK, section: 'catalog', brain_version_id: 'bv2', now: '2026-06-12 11:00:00.000' });
    expect(fact.canonical_confidence).toBeLessThanOrEqual(0.6);
  });

  it('operator_locked fact is not overwritten', () => {
    const locked: CanonicalFact = {
      merchant_id: 'gearit', fact_key: FK, section: 'catalog', canonical_value: JSON.stringify({ status: 'excluded' }),
      canonical_confidence: 1, supporting_observation_ids: ['op'], conflicting_observation_ids: [],
      min_privacy: 'internal_only', last_updated_at: '2026-06-12 10:30:00.000', last_brain_version_id: 'bv1',
      freshness_status: 'operator_locked', operator_locked: true, expires_at: null, review_status: 'confirmed',
    };
    const { fact, changed } = synthesizeFact(locked, [obs('w2', 'sellable', 'public_demo_safe', 'direct')],
      { fact_key: FK, section: 'catalog', brain_version_id: 'bv3', now: '2026-06-12 12:00:00.000' });
    expect(changed).toBe(false);
    expect(fact.canonical_value).toBe(JSON.stringify({ status: 'excluded' }));
  });
});
