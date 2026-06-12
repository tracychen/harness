import { describe, it, expect } from 'vitest';
import { detectConflict } from './conflict';
import type { Observation } from './types';

const obs = (id: string, value: string, directness: Observation['directness'] = 'direct'): Observation => ({
  merchant_id: 'gearit', observation_id: id, source_id: 's_' + id, fact_key: 'catalog.products.cat6_flat.sellable_status',
  observation_type: 'product_status', claim: value, structured_value: JSON.stringify({ status: value }),
  extraction_confidence: 0.9, directness, evidence_ref: 'ref', privacy_class: 'public_demo_safe',
  observed_at: '2026-06-12 10:00:00.000', extraction_method: 'llm', review_status: 'auto_accepted',
});

describe('detectConflict', () => {
  it('flags conflict when normalized values differ', () => {
    const r = detectConflict([obs('a', 'sellable'), obs('b', 'excluded')]);
    expect(r.conflicted).toBe(true);
    expect(r.conflictingObservationIds.sort()).toEqual(['a', 'b']);
  });

  it('no conflict when values agree', () => {
    const r = detectConflict([obs('a', 'sellable'), obs('b', 'sellable')]);
    expect(r.conflicted).toBe(false);
    expect(r.conflictingObservationIds).toEqual([]);
  });
});
