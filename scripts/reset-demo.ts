import { ch } from '../lib/brain/clickhouse';

const TABLES = [
  'evidence_sources', 'observations', 'brain_versions', 'canonical_facts',
  'update_events', 'operator_decisions', 'context_bundles',
];

async function main() {
  for (const t of TABLES) {
    await ch().command({ query: `TRUNCATE TABLE ${t}` });
    console.log('truncated', t);
  }
  console.log('reset done');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
