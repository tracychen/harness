import { describe, it, expect } from 'vitest';
import { computeCoverage, TARGET_FACT_KEYS } from './coverage';

describe('computeCoverage', () => {
  it('counts a target as covered when its exact fact_key is present', () => {
    const cov = computeCoverage(['identity.display_name', 'markets.primary_country']);
    expect(cov.total).toBe(TARGET_FACT_KEYS.length);
    expect(cov.known).toBe(2);
    expect(cov.targets.find((t) => t.id === 'identity.display_name')?.covered).toBe(true);
  });

  it('covers the per-SKU product-status target via any catalog.products.*.sellable_status fact', () => {
    const cov = computeCoverage(['catalog.products.cat6_flat.sellable_status']);
    expect(cov.targets.find((t) => t.id === 'catalog.products.sellable_status')?.covered).toBe(true);
    expect(cov.known).toBe(1);
  });

  it('lists uncovered target ids in missing and ignores unknown keys', () => {
    const cov = computeCoverage(['identity.display_name', 'totally.unknown.key']);
    expect(cov.known).toBe(1);
    expect(cov.missing).toContain('markets.primary_country');
    expect(cov.missing).not.toContain('identity.display_name');
  });
});
