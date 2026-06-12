import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest } from './ingest';
import { researchMerchant } from './research/websearch';
import { synthesizeRun } from './synthesizeRun';

function loadFixture(name: string) {
  const j = JSON.parse(readFileSync(join(process.cwd(), `fixtures/gearit/${name}.json`), 'utf8'));
  return { source: j.source, observations: j.observations };
}

/** Full loop: research the web + ingest ground-truth fixtures → synthesize canonical brain. */
export async function runBrain(merchantId: string, domain: string, nowIso: string) {
  const research = await researchMerchant(domain);
  await ingest(merchantId, { source: { source_type: 'web_research', source_name: research.source_name, privacy_class: 'public_demo_safe', source_reliability: 0.7 }, observations: research.observations }, nowIso);
  for (const fx of ['onboarding', 'gmc-snapshot', 'operator-decision']) {
    await ingest(merchantId, loadFixture(fx), nowIso);
  }
  return synthesizeRun(merchantId, 'ingest', nowIso);
}

/** Write-back: ingest a pre-made artifact and re-synthesize (derived → can't self-reinforce). */
export async function writeBack(merchantId: string, nowIso: string) {
  await ingest(merchantId, loadFixture('writeback'), nowIso);
  return synthesizeRun(merchantId, 'write_back', nowIso);
}
