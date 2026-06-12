import { readFileSync } from 'node:fs';
import { ingest } from '../lib/brain/ingest';
import { synthesizeRun } from '../lib/brain/synthesizeRun';

async function main() {
  const env = JSON.parse(readFileSync('fixtures/gearit/onboarding.json', 'utf8'));
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  await ingest('gearit', { source: env.source, observations: env.observations }, now);
  const r = await synthesizeRun('gearit', 'ingest', now);
  console.log('seeded onboarding · facts:', r.changedKeys);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
