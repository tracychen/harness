import { researchMerchant } from '../lib/brain/research/websearch';
researchMerchant('https://www.gearit.com')
  .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
