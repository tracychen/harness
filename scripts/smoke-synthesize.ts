import { readFileSync } from 'node:fs';
import { ingest } from '../lib/brain/ingest';
import { synthesizeRun } from '../lib/brain/synthesizeRun';
import { query } from '../lib/brain/clickhouse';

async function main() {
  for (const f of ['onboarding', 'cached-research', 'gmc-snapshot']) {
    const env = JSON.parse(readFileSync(`fixtures/gearit/${f}.json`, 'utf8'));
    await ingest('gearit', { source: env.source, observations: env.observations }, '2026-06-12 10:00:00.000');
  }
  const r = await synthesizeRun('gearit', 'ingest', '2026-06-12 11:00:00.000');
  const facts = await query<{ fact_key: string; freshness_status: string; min_privacy: string }>(
    `SELECT fact_key, freshness_status, min_privacy FROM canonical_facts FINAL WHERE merchant_id='gearit' AND fact_key LIKE 'catalog.products%'`);
  console.log('brain version:', r.brain_version_id, 'changed:', r.changedKeys);
  console.log('cat6_flat fact:', facts);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
