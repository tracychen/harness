import Anthropic from '@anthropic-ai/sdk';
import { query } from './clickhouse';
import { ingest } from './ingest';
import { synthesizeRun } from './synthesizeRun';
import { parseOpenQuestions, nextOpenQuestions } from './openQuestions';
import type { CanonicalFact } from './types';

interface RawObs { fact_key: string; claim: string; structured_value: unknown; evidence_ref: string; directness: 'direct' | 'inferred' | 'derived'; confidence: number }

/** Tolerant extraction of the research agent's reply: a {observations, resolved, new_questions}
 *  object, or a bare observations array (when the model ignores the envelope). */
function extractResearch(text: string): { observations: RawObs[]; resolved: string[]; new_questions: string[] } {
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      const o = JSON.parse(obj[0]);
      if (o && Array.isArray(o.observations)) {
        return {
          observations: o.observations as RawObs[],
          resolved: Array.isArray(o.resolved) ? o.resolved.map(String) : [],
          new_questions: Array.isArray(o.new_questions) ? o.new_questions.map(String) : [],
        };
      }
    } catch { /* fall through to array form */ }
  }
  const arr = text.match(/\[[\s\S]*\]/);
  try { return { observations: arr ? (JSON.parse(arr[0]) as RawObs[]) : [], resolved: [], new_questions: [] }; }
  catch { return { observations: [], resolved: [], new_questions: [] }; }
}

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
export type Turn = { role: 'user' | 'assistant'; content: string };

/** Grounded Q&A: Claude answers ONLY from the merchant's stored canonical facts, with full conversation context. */
export async function answerFromBrain(merchant: string, message: string, history: Turn[] = []): Promise<ChatAnswer> {
  const facts = await loadFacts(merchant);
  const client = new Anthropic();
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system:
      `You are Brainbox, the grounded knowledge base for "${merchant}" used to feed AEO (Answer Engine Optimization) workflows. ` +
      `Use the prior conversation for context, and answer the user's latest message ONLY from the FACTS below. Be concise and concrete (2-5 sentences). ` +
      `Cite the fact_keys you used inline in brackets, e.g. [identity.display_name]. ` +
      `If the FACTS don't cover it, briefly say what's missing and that the operator can run a web search to fill the gap. ` +
      `Never claim that you yourself can or cannot browse the web, and never invent facts.\n\nFACTS:\n${factsContext(facts)}`,
    messages: [...history, { role: 'user', content: message }],
  });
  const answer = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim();
  const factKeys = facts.map((f) => f.fact_key).filter((k) => answer.includes(k));
  return { answer, factKeys, factCount: facts.length };
}

export interface Learned { learned: string[]; summary: string; brainVersionId: string | null; }

/** Agentic gap-fill: live web_search focused on the question, then write new facts back into the brain. */
export async function researchAndLearn(merchant: string, domain: string, focus: string, nowIso: string, history: Turn[] = []): Promise<Learned> {
  const client = new Anthropic();
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 } as never];
  const lastUserQ = [...history].reverse().find((h) => h.role === 'user' && h.content.trim().length > 12)?.content;
  // A short or command-like message ("research to fill this gap", "go ahead") researches the last real question instead.
  const isCommand = focus.trim().length < 28 || /\b(this gap|the gap|fill it|go ahead|do it)\b/i.test(focus) || /^(research|go|yes|please|find|search|look)\b/i.test(focus.trim());
  const topic = isCommand && lastUserQ ? lastUserQ : focus;

  // Compounding loop (consume): fold the brain's own open questions into this research run.
  const facts = await loadFacts(merchant);
  const openQuestions = parseOpenQuestions(facts.find((f) => f.fact_key === 'decisions.open_questions')?.canonical_value);
  const agendaBlock = openQuestions.length
    ? `The brain also has these OPEN QUESTIONS — research any you can:\n${openQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`
    : '';
  const outputSpec = openQuestions.length
    ? `Output ONLY a JSON object as your final message (no prose, no code fences): ` +
      `{"observations":[{"fact_key","claim","structured_value","evidence_ref"(source URL),"directness"("direct"|"inferred"),"confidence"(0-1)}],` +
      `"resolved":[exact open-question strings you answered],"new_questions":[short follow-up questions worth researching next]}. ` +
      `Do not put decisions.open_questions inside observations.`
    : `Output ONLY a JSON array as your final message (no prose, no code fences): ` +
      `[{"fact_key","claim","structured_value","evidence_ref"(source URL),"directness"("direct"|"inferred"),"confidence"(0-1)}].`;
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content:
      `Research the open web about the merchant at ${domain} to answer this question: "${topic}". ` +
      `Gather only claims you can support with a real source URL. ` +
      `Use concise dotted fact_keys (identity.*, catalog.*, markets.*, audience.*, brand.*, blog.topic_candidates, reviews.*). ` +
      agendaBlock + outputSpec,
  }];
  let res = await client.messages.create({ model: 'claude-opus-4-8', max_tokens: 4096, tools, messages });
  const allText: string[] = [];
  const collect = (content: typeof res.content) => content.forEach((b) => { if (b.type === 'text') allText.push((b as { text: string }).text); });
  collect(res.content);
  // web_search can return stop_reason "pause_turn"; continue, collecting text from every turn.
  let guard = 0;
  while (res.stop_reason === 'pause_turn' && guard++ < 4) {
    messages.push({ role: 'assistant', content: res.content });
    res = await client.messages.create({ model: 'claude-opus-4-8', max_tokens: 4096, tools, messages });
    collect(res.content);
  }
  const text = allText.join('\n');
  const parsed = extractResearch(text);
  const observations = parsed.observations.filter((o) => o && o.fact_key && o.evidence_ref && o.fact_key !== 'decisions.open_questions');

  // Compounding loop (close + surface): drop questions the agent answered, add any it
  // raised, and write the updated agenda back as one latest-wins observation.
  const updatedAgenda = nextOpenQuestions(openQuestions, parsed.resolved, parsed.new_questions);
  const agendaChanged = JSON.stringify(updatedAgenda) !== JSON.stringify(openQuestions);
  if (!observations.length && !agendaChanged) return { learned: [], summary: 'Searched the web but found no new grounded facts to add.', brainVersionId: null };

  const ingestObs: RawObs[] = observations.map((o) => ({ ...o, directness: o.directness ?? 'inferred' }));
  if (agendaChanged) ingestObs.push({
    fact_key: 'decisions.open_questions',
    claim: updatedAgenda.length ? `Open questions: ${updatedAgenda.join('; ')}` : 'No open questions remain',
    structured_value: updatedAgenda, evidence_ref: 'agent:open_questions', directness: 'derived', confidence: 0.7,
  });

  await ingest(merchant, {
    source: { source_type: 'web_research', source_name: `live research · ${focus.slice(0, 60)}`, privacy_class: 'public_demo_safe', source_reliability: 0.7 },
    observations: ingestObs,
  }, nowIso);
  const r = await synthesizeRun(merchant, 'ingest', nowIso);

  const closed = parsed.resolved.filter((q) => openQuestions.some((o) => o.trim() === q.trim())).length;
  const bits = [`wrote ${r.changedKeys.length} new/updated fact(s)`];
  if (closed) bits.push(`closed ${closed} open question(s)`);
  if (parsed.new_questions.length) bits.push(`raised ${parsed.new_questions.length} follow-up(s)`);
  return { learned: r.changedKeys, summary: `Researched the web and ${bits.join(', ')}.`, brainVersionId: r.brain_version_id };
}
