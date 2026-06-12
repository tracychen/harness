// Launches the stdio MCP server as a subprocess and exercises its tools.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type Block = { type: string; text?: string };

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--env-file=.env.local', '--import', 'tsx', 'mcp/server.ts'],
  });
  const client = new Client({ name: 'mcp-smoke', version: '0.1.0' });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log('TOOLS:', tools.tools.map((t) => t.name).join(', '));

  const cov = await client.callTool({ name: 'brain_get_coverage', arguments: { merchant: 'gearit' } });
  console.log('COVERAGE:', JSON.stringify(cov.structuredContent));

  const ask = await client.callTool({ name: 'brain_ask', arguments: { merchant: 'gearit', question: 'What does GEARit sell and who buys it?' } });
  const text = (ask.content as Block[]).map((c) => c.text ?? '').join('');
  console.log('ASK:', text.slice(0, 280));

  await client.close();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
