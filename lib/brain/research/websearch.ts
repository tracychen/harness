import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RawObservation {
  fact_key: string; claim: string; structured_value: unknown;
  evidence_ref: string; directness: 'direct' | 'inferred' | 'derived'; confidence: number;
}
export interface ResearchResult { source_name: string; observations: RawObservation[]; }

/** Live web research. Falls back to the cached fixture when USE_CACHED_RESEARCH=1 (demo safety). */
export async function researchMerchant(domain: string): Promise<ResearchResult> {
  if (process.env.USE_CACHED_RESEARCH === '1') {
    const j = JSON.parse(readFileSync(join(process.cwd(), 'fixtures/gearit/cached-research.json'), 'utf8'));
    return { source_name: j.source.source_name, observations: j.observations };
  }
  const client = new Anthropic();
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 } as never],
    messages: [{
      role: 'user',
      content:
        `Research the merchant at ${domain}. Find: hero/bestselling products (with stock signals), ` +
        `buyer topic candidates for blog content, the brand's primary market, ` +
        `common buyer objections (mine product reviews and forums), the domains that currently rank or get cited for the brand's buyer queries, ` +
        `and high-intent buyer queries the brand answers weakly today. ` +
        `Return ONLY a JSON array of observations: ` +
        `[{"fact_key","claim","structured_value","evidence_ref"(URL),"directness","confidence"}]. ` +
        `Use fact_keys like identity.display_name, catalog.products.<sku>.sellable_status, blog.topic_candidates, markets.primary_country, ` +
        `buyer_language.common_objections, citation.cited_domains, query.target_gaps.`,
    }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
  const match = text.match(/\[[\s\S]*\]/);
  const observations: RawObservation[] = match ? JSON.parse(match[0]) : [];
  return { source_name: `${domain} live research`, observations };
}
