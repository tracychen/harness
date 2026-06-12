import { buildBlogBundle } from '../lib/brain/bundleRun';
import { pushBundleToNotion } from '../lib/brain/publish/notion';

async function main() {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const result = await pushBundleToNotion(await buildBlogBundle('gearit', 'latest', now));
  console.log('notion page result:', result);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
