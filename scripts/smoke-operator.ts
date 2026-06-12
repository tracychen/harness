import { resolveAndLock } from '../lib/brain/operator';
import { query } from '../lib/brain/clickhouse';

async function main() {
  await resolveAndLock('gearit', 'catalog.products.cat6_flat.sellable_status', JSON.stringify({ status: 'excluded' }), 'High return rate — exclude this quarter', '2026-06-12 11:30:00.000');
  const [f] = await query<{ freshness_status: string; operator_locked: number }>(
    `SELECT freshness_status, operator_locked FROM canonical_facts FINAL WHERE merchant_id='gearit' AND fact_key='catalog.products.cat6_flat.sellable_status'`);
  console.log('locked fact:', f);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
