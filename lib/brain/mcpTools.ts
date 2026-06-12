// Shared MCP tool registrar — used by both the stdio server (mcp/server.ts) and the
// hosted HTTP route (app/api/mcp/route.ts) so the two transports never drift.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { answerFromBrain, researchAndLearn } from './chat';
import { query } from './clickhouse';
import { computeCoverage } from './coverage';
import { assertMerchantId, resolveMerchantDomain } from './validate';
import type { CanonicalFact } from './types';

type FactRow = Omit<CanonicalFact, 'operator_locked'> & { operator_locked: number };

async function loadFacts(merchant: string): Promise<CanonicalFact[]> {
  const rows = await query<FactRow>(
    `SELECT * FROM canonical_facts FINAL WHERE merchant_id={merchant_id:String}`,
    { merchant_id: merchant },
  );
  return rows.map((r) => ({ ...r, operator_locked: !!r.operator_locked }) as CanonicalFact);
}

const now = () => new Date().toISOString().replace('T', ' ').replace('Z', '');
const MERCHANT = z.string().describe('Merchant id. Defaults to "gearit".').optional();

type Result = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const fail = (e: unknown): Result => ({ isError: true, content: [{ type: 'text', text: `Error: ${(e as Error).message}. Check the merchant id and that CLICKHOUSE_*/ANTHROPIC_API_KEY env vars are set.` }] });

export function registerBrainTools(server: McpServer): void {
  server.registerTool('brain_ask', {
    title: 'Ask the merchant brain',
    description:
      'Ask a question and get a concise answer grounded ONLY in the brain\'s stored, cited facts (answers include [fact_key] citations). ' +
      'If the brain lacks the info, it says what is missing — call brain_research to fill the gap. Read-only.',
    inputSchema: {
      merchant: MERCHANT,
      question: z.string().min(1).describe('A natural-language question about the merchant, e.g. "What does GEARit sell and who buys it?"'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ merchant = 'gearit', question }) => {
    try {
      const m = assertMerchantId(merchant);
      const r = await answerFromBrain(m, question);
      return { content: [{ type: 'text', text: r.answer }], structuredContent: { answer: r.answer, citedFactKeys: r.factKeys, factCount: r.factCount } };
    } catch (e) { return fail(e); }
  });

  server.registerTool('brain_research', {
    title: 'Research the web and teach the brain',
    description:
      'Run a live web search focused on a question, extract grounded facts (each backed by a source URL), and WRITE them into the brain. ' +
      'Use when brain_ask reports a gap. Returns the fact_keys learned. Mutates the brain (additive, not destructive); hits the open web.',
    inputSchema: {
      merchant: MERCHANT,
      question: z.string().min(1).describe('What to research, e.g. "Who is GEARit\'s target customer and what are its flagship products?"'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ merchant = 'gearit', question }) => {
    try {
      const m = assertMerchantId(merchant);
      const domain = resolveMerchantDomain(m);
      const r = await researchAndLearn(m, domain, question, now());
      return { content: [{ type: 'text', text: `${r.summary}${r.learned.length ? ' Learned: ' + r.learned.join(', ') : ''}` }], structuredContent: { summary: r.summary, learnedFactKeys: r.learned } };
    } catch (e) { return fail(e); }
  });

  server.registerTool('brain_get_context', {
    title: 'Get the brain knowledge base',
    description:
      'Return every canonical fact the brain holds for the merchant (fact_key, value, confidence, freshness, source count, privacy class) ' +
      'plus a coverage score of how complete the brain is. Read-only — the grounded context layer for downstream agents.',
    inputSchema: { merchant: MERCHANT },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ merchant = 'gearit' }) => {
    try {
      const m = assertMerchantId(merchant);
      const facts = await loadFacts(m);
      const coverage = computeCoverage(facts.map((f) => f.fact_key));
      const view = facts.map((f) => ({ fact_key: f.fact_key, value: f.canonical_value, confidence: f.canonical_confidence, freshness: f.freshness_status, sources: f.supporting_observation_ids.length, privacy: f.min_privacy }));
      return { content: [{ type: 'text', text: `${facts.length} facts · coverage ${coverage.known}/${coverage.total}. Missing: ${coverage.missing.join(', ') || 'none'}` }], structuredContent: { factCount: facts.length, coverage, facts: view } };
    } catch (e) { return fail(e); }
  });

  server.registerTool('brain_get_coverage', {
    title: 'Get brain coverage and gaps',
    description:
      'Return the brain\'s coverage against the target fact set: which knowledge areas are known vs missing. ' +
      'Use to decide what to brain_research next. Read-only.',
    inputSchema: { merchant: MERCHANT },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ merchant = 'gearit' }) => {
    try {
      const m = assertMerchantId(merchant);
      const facts = await loadFacts(m);
      const coverage = computeCoverage(facts.map((f) => f.fact_key));
      return { content: [{ type: 'text', text: `Coverage ${coverage.known}/${coverage.total}. Missing: ${coverage.missing.join(', ') || 'none'}` }], structuredContent: { ...coverage } };
    } catch (e) { return fail(e); }
  });
}
