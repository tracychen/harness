// Exercises the hosted HTTP MCP route via the streamable-HTTP client transport.
// MCP_URL defaults to the local dev route; set it to the deployed URL to test prod.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type Block = { type: string; text?: string };

async function main() {
  const url = new URL(process.env.MCP_URL ?? 'http://localhost:3000/api/mcp');
  const headers: Record<string, string> = process.env.MCP_TOKEN ? { authorization: `Bearer ${process.env.MCP_TOKEN}` } : {};
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  const client = new Client({ name: 'mcp-http-smoke', version: '0.1.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log('TOOLS:', tools.tools.map((t) => t.name).join(', '));

  const cov = await client.callTool({ name: 'brain_get_coverage', arguments: { merchant: 'gearit' } });
  console.log('COVERAGE:', JSON.stringify(cov.structuredContent));

  const ask = await client.callTool({ name: 'brain_ask', arguments: { merchant: 'gearit', question: 'What does GEARit sell?' } });
  console.log('ASK:', (ask.content as Block[]).map((c) => c.text ?? '').join('').slice(0, 220));

  await client.close();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
