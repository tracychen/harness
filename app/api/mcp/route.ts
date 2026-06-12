import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerBrainTools } from '@/lib/brain/mcpTools';

export const runtime = 'nodejs';
export const maxDuration = 120;

function unauthorized(): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'unauthorized' }, id: null }),
    { status: 401, headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' } },
  );
}

// Hosted MCP endpoint. Stateless: a fresh server + transport per request, so it runs
// fine on serverless. Gated by MCP_TOKEN when set (required for any public deploy).
async function handle(req: Request): Promise<Response> {
  const token = process.env.MCP_TOKEN;
  if (token && req.headers.get('authorization') !== `Bearer ${token}`) return unauthorized();

  const server = new McpServer({ name: 'merchant-brain', version: '0.1.0' });
  registerBrainTools(server);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
