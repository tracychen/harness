import { randomUUID } from 'node:crypto';
import { insertRows, query } from './clickhouse';
import type { CanonicalFact, OperatorDecision } from './types';

type CanonicalFactRow = Omit<CanonicalFact, 'operator_locked'> & { operator_locked: number };

/** Operator confirms the winning value for a conflicted fact and locks it. */
export async function resolveAndLock(merchantId: string, factKey: string, chosenValue: string, rationale: string, nowIso: string): Promise<void> {
  const decision: OperatorDecision = {
    decision_id: randomUUID(), merchant_id: merchantId, fact_key: factKey, chosen_value: chosenValue,
    rationale, locked: true, expires_at: null, decided_by: 'operator', created_at: nowIso,
  };
  await insertRows('operator_decisions', [{ ...decision, locked: 1 }]);

  const [cur] = await query<CanonicalFactRow>(
    `SELECT * FROM canonical_facts FINAL WHERE merchant_id={merchant_id:String} AND fact_key={fact_key:String} LIMIT 1`,
    { merchant_id: merchantId, fact_key: factKey });
  const locked: CanonicalFact = {
    ...(cur as unknown as CanonicalFact),
    merchant_id: merchantId, fact_key: factKey, section: factKey.split('.')[0],
    canonical_value: chosenValue, canonical_confidence: 1, conflicting_observation_ids: [],
    min_privacy: cur?.min_privacy ?? 'internal_only', last_updated_at: nowIso,
    freshness_status: 'operator_locked', operator_locked: true, expires_at: null, review_status: 'confirmed',
    supporting_observation_ids: cur?.supporting_observation_ids ?? [], last_brain_version_id: cur?.last_brain_version_id ?? '',
  };
  await insertRows('canonical_facts', [{ ...locked, operator_locked: 1 }]);
}
