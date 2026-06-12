import { runBrain } from '../lib/brain/orchestrator';

const i = process.argv.indexOf('--merchant');
const merchant = i >= 0 ? process.argv[i + 1] : 'gearit';

async function main() {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const r = await runBrain(merchant, 'https://www.gearit.com', now);
  console.log('daily rerun done:', merchant, r.brain_version_id, 'changed:', r.changedKeys);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
