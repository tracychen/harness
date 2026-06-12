#!/usr/bin/env node
// Merchant Brain MCP server (stdio). Mounts the brain as tools for any local MCP
// client (Claude Desktop, Cursor, Claude Code). Tool definitions live in
// lib/brain/mcpTools.ts — shared with the hosted HTTP route so the two never drift.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerBrainTools } from '../lib/brain/mcpTools';

const server = new McpServer({ name: 'merchant-brain', version: '0.1.0' });
registerBrainTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('merchant-brain MCP server ready (stdio) · tools: brain_ask, brain_research, brain_get_context, brain_get_coverage');
}
main().catch((e) => { console.error(e); process.exit(1); });
