import Anthropic from '@anthropic-ai/sdk';
import { query } from './clickhouse';
import { ingest } from './ingest';
import { synthesizeRun } from './synthesizeRun';
import type { CanonicalFact } from './types';

type FactRow = Omit<CanonicalFact, 'operator_locked'> & { operator_locked: number };

async function loadFacts(merchantId: string): Promise<CanonicalFact[]> {
  const rows = await query<FactRow>(
    `SELECT * FROM canonical_facts FINAL WHERE merchant_id={merchant_id:String}`,
    { merchant_id: merchantId },
  );
  return rows.map((r) => ({ ...r, operator_locked: !!r.operator_locked }) as CanonicalFact);
}

function factsContext(facts: CanonicalFact[]): string {
  if (!facts.length) return '(the knowledge base is currently empty — nothing has been learned yet)';
  return facts
    .map((f) => `- ${f.fact_key} = ${f.canonical_value} [confidence ${f.canonical_confidence}, ${f.freshness_status}, ${f.supporting_observation_ids.length} source(s)]`)
    .join('\n');
}

export interface ChatAnswer { answer: string; factKeys: string[]; factCount: number; }

/** Grounded Q&A: Claude answers ONLY from the merchant's stored canonical facts. */
export async function answerFromBrain(merchant: string, message: string): Promise<ChatAnswer> {
  const facts = await loadFacts(merchant);
  const client = new Anthropic();
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system:
      `You are the Merchant Brain for "${merchant}" — a grounded knowledge base used to feed AEO (Answer Engine Optimization) workflows. ` +
      `Answer the user's question ONLY from the FACTS below. Be concise and concrete (2-5 sentences). ` +
      `Cite the fact_keys you used inline in brackets, e.g. [identity.display_name]. ` +
      `If the facts do not cover the question, say plainly what is missing and that you can research the open web to fill the gap. Never invent facts.\n\nFACTS:\n${factsContext(facts)}`,
    messages: [{ role: 'user', content: message }],
  });
  const answer = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim();
  const factKeys = facts.map((f) => f.fact_key).filter((k) => answer.includes(k));
  return { answer, factKeys, factCount: facts.length };
}

export interface Learned { learned: string[]; summary: string; brainVersionId: string | null; }

/** Agentic gap-fill: live web_search focused on the question, then write new facts back into the brain. */
export async function researchAndLearn(merchant: string, domain: string, focus: string, nowIso: string): Promise<Learned> {
  const client = new Anthropic();
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 } as never];
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content:
      `Research this question about the merchant at ${domain}: "${focus}". ` +
      `Gather only claims you can support with a real source URL. ` +
      `Return ONLY a JSON array of observations: ` +
      `[{"fact_key","claim","structured_value","evidence_ref"(source URL),"directness"("direct"|"inferred"),"confidence"(0-1)}]. ` +
      `Use concise dotted fact_keys (identity.*, catalog.*, markets.*, audience.*, brand.*, blog.topic_candidates, reviews.*).`,
  }];
  let res = await client.messages.create({ model: 'claude-opus-4-8', max_tokens: 4096, tools, messages });
  // web_search can return stop_reason "pause_turn"; append the partial turn and continue.
  let guard = 0;
  while (res.stop_reason === 'pause_turn' && guard++ < 4) {
    messages.push({ role: 'assistant', content: res.content });
    res = await client.messages.create({ model: 'claude-opus-4-8', max_tokens: 4096, tools, messages });
  }
  const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
  const m = text.match(/\[[\s\S]*\]/);
  let observations: { fact_key: string; claim: string; structured_value: unknown; evidence_ref: string; directness: 'direct' | 'inferred' | 'derived'; confidence: number }[] = [];
  try { observations = m ? JSON.parse(m[0]) : []; } catch { observations = []; }
  observations = observations.filter((o) => o && o.fact_key && o.evidence_ref);
  if (!observations.length) return { learned: [], summary: 'Searched the web but found no new grounded facts to add.', brainVersionId: null };

  await ingest(merchant, {
    source: { source_type: 'web_research', source_name: `live research · ${focus.slice(0, 60)}`, privacy_class: 'public_demo_safe', source_reliability: 0.7 },
    observations: observations.map((o) => ({ ...o, directness: o.directness ?? 'inferred' })),
  }, nowIso);
  const r = await synthesizeRun(merchant, 'ingest', nowIso);
  return { learned: r.changedKeys, summary: `Researched the web and wrote ${r.changedKeys.length} new/updated fact(s) into the brain.`, brainVersionId: r.brain_version_id };
}
