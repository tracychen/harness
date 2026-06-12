import { randomUUID } from 'node:crypto';
import { insertRows, query } from './clickhouse';
import { composeBlogBundle, publishSafe } from './bundle';
import type { CanonicalFact, ContextBundle } from './types';

type CanonicalFactRow = Omit<CanonicalFact, 'operator_locked'> & { operator_locked: number };

export async function buildBlogBundle(merchantId: string, brainVersionId: string, nowIso: string): Promise<ContextBundle> {
  const rows = await query<CanonicalFactRow>(
    `SELECT * FROM canonical_facts FINAL WHERE merchant_id={merchant_id:String}`,
    { merchant_id: merchantId });
  const facts = rows.map((r) => ({ ...r, operator_locked: !!r.operator_locked } as CanonicalFact));
  const payload = composeBlogBundle(facts);
  const published_payload = publishSafe(payload);
  const bundle: ContextBundle = {
    bundle_id: randomUUID(), merchant_id: merchantId, purpose: 'blog_source_material',
    brain_version_id: brainVersionId, generated_at: nowIso, source_cutoff_at: nowIso,
    payload, published_payload, cited_md_url: null,
  };
  await insertRows('context_bundles', [{ ...bundle, payload: JSON.stringify(payload), published_payload: JSON.stringify(published_payload) }]);
  return bundle;
}
