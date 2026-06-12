import assert from 'node:assert';
import { runBrain, writeBack } from '../lib/brain/orchestrator';
import { resolveAndLock } from '../lib/brain/operator';
import { buildBlogBundle } from '../lib/brain/bundleRun';
import { publishSafe } from '../lib/brain/bundle';

const FK = 'catalog.products.cat6_flat.sellable_status';
const ts = (h: number) => `2026-06-12 ${String(h).padStart(2, '0')}:00:00.000`;

async function main() {
  process.env.USE_CACHED_RESEARCH = '1';
  await runBrain('gearit', 'https://www.gearit.com', ts(10));

  let b = await buildBlogBundle('gearit', 'latest', ts(11));
  assert(b.payload.conflicts.includes(FK), 'expected conflict on cat6_flat');
  assert(b.payload.topic_candidates.find((t) => t.topic.includes('flat Cat6'))?.blocked, 'flat-Cat6 topic must be blocked');

  await resolveAndLock('gearit', FK, JSON.stringify({ status: 'excluded' }), 'high returns', ts(12));
  b = await buildBlogBundle('gearit', 'latest', ts(13));
  assert(b.payload.locked_decisions.some((d) => d.includes('cat6_flat')), 'decision must be locked');

  const before = b.payload.topic_candidates.length + (b.payload.open_questions?.length ?? 0);
  await writeBack('gearit', ts(14));
  b = await buildBlogBundle('gearit', 'latest', ts(15));
  const after = b.payload.topic_candidates.length + (b.payload.open_questions?.length ?? 0);
  assert(after > before, 'write-back must change the bundle');

  const pub = publishSafe(b.payload);
  assert(!pub.facts.some((f) => f.fact_key === FK), 'published payload must NOT contain the internal excluded fact');

  console.log('✅ acceptance passed');
}
main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
