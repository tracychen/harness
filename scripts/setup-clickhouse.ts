import { ch } from '../lib/brain/clickhouse';
import { DDL } from '../lib/brain/ddl';

async function main() {
  for (const stmt of DDL) {
    await ch().command({ query: stmt });
    console.log('created:', stmt.split('\n')[0]);
  }
  console.log('done');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
