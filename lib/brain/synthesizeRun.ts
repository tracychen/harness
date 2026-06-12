import { randomUUID } from 'node:crypto';
import { insertRows, query } from './clickhouse';
import { synthesizeFact } from './synthesize';
import type { BrainVersion, CanonicalFact, Observation, UpdateEvent } from './types';

const SECTION = (fk: string) => fk.split('.')[0];

type CanonicalFactRow = Omit<CanonicalFact, 'operator_locked'> & { operator_locked: number };

async function loadCurrent(merchantId: string): Promise<Map<string, CanonicalFact>> {
  const rows = await query<CanonicalFactRow>(
    `SELECT * FROM canonical_facts FINAL WHERE merchant_id='${merchantId}'`);
  return new Map(rows.map((r) => [r.fact_key, { ...r, operator_locked: !!r.operator_locked } as CanonicalFact]));
}

/** Recompute canonical facts for every fact_key touched by the merchant's observations. */
export async function synthesizeRun(merchantId: string, trigger: BrainVersion['trigger'], nowIso: string): Promise<{ brain_version_id: string; changedKeys: string[] }> {
  const brain_version_id = randomUUID();
  const obs = await query<Observation>(`SELECT * FROM observations WHERE merchant_id='${merchantId}'`);
  const current = await loadCurrent(merchantId);

  const byKey = new Map<string, Observation[]>();
  for (const o of obs) byKey.set(o.fact_key, [...(byKey.get(o.fact_key) ?? []), o]);

  const facts: CanonicalFact[] = [];
  const events: UpdateEvent[] = [];
  const changedKeys: string[] = [];

  for (const [fact_key, group] of byKey) {
    const cur = current.get(fact_key) ?? null;
    const { fact, changed } = synthesizeFact(cur, group, { fact_key, section: SECTION(fact_key), brain_version_id, now: nowIso });
    facts.push(fact);
    if (changed) {
      changedKeys.push(fact_key);
      events.push({
        event_id: randomUUID(), merchant_id: merchantId, brain_version_id, source_id: group[0].source_id,
        observation_id: group[0].observation_id, fact_key,
        delta: JSON.stringify({ from: cur?.canonical_value ?? null, to: fact.canonical_value, status: fact.freshness_status }),
        from_derived: group.every((g) => g.directness === 'derived'), created_at: nowIso,
      });
    }
  }

  await insertRows<BrainVersion>('brain_versions', [{ brain_version_id, merchant_id: merchantId, parent_version_id: null, trigger, created_at: nowIso }]);
  await insertRows('canonical_facts', facts.map((f) => ({ ...f, operator_locked: f.operator_locked ? 1 : 0 })));
  if (events.length) await insertRows('update_events', events.map((e) => ({ ...e, from_derived: e.from_derived ? 1 : 0 })));
  return { brain_version_id, changedKeys };
}
