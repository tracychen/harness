import { readFileSync } from 'node:fs';
import { ingest } from '../lib/brain/ingest';
import { query } from '../lib/brain/clickhouse';

async function main() {
  const env = JSON.parse(readFileSync('fixtures/gearit/onboarding.json', 'utf8'));
  await ingest('gearit', { source: env.source, observations: env.observations }, '2026-06-12 10:00:00.000');
  const rows = await query<{ c: number }>(`SELECT count() AS c FROM observations WHERE merchant_id='gearit'`);
  console.log('observations for gearit:', rows[0]?.c);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
