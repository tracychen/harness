import { Composio } from '@composio/core';
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
const userId = process.env.COMPOSIO_NOTION_USER_ID ?? 'gearit_demo';
async function main() {
  const conn = await composio.connectedAccounts.link(userId, process.env.NOTION_AUTH_CONFIG_ID!);
  console.log('Open this URL to connect Notion, then re-run smoke-notion:', conn.redirectUrl);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
