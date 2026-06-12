import { buildBlogBundle } from '../lib/brain/bundleRun';
import { publishCited } from '../lib/brain/publish/senso';

async function main() {
  const b = await buildBlogBundle('gearit', 'latest', '2026-06-12 12:00:00.000');
  const url = await publishCited(b);
  console.log('cited.md url:', url);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
