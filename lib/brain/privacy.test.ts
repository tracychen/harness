import { describe, it, expect } from 'vitest';
import { isDemoSafe, mostRestrictive, type PrivacyClass } from './types';

describe('privacy', () => {
  it('only public_demo_safe is demo safe', () => {
    expect(isDemoSafe('public_demo_safe')).toBe(true);
    expect(isDemoSafe('internal_only')).toBe(false);
    expect(isDemoSafe('merchant_confidential')).toBe(false);
  });

  it('mostRestrictive returns the stricter of two classes', () => {
    expect(mostRestrictive('public_demo_safe', 'internal_only')).toBe('internal_only');
    expect(mostRestrictive('internal_only', 'merchant_confidential')).toBe('merchant_confidential');
    expect(mostRestrictive('public_demo_safe', 'public_demo_safe')).toBe('public_demo_safe');
  });
});
