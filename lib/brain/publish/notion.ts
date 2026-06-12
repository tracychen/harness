import { Composio } from '@composio/core';
import type { ContextBundle } from '../types';

export async function pushBundleToNotion(b: ContextBundle): Promise<unknown> {
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
  const userId = process.env.COMPOSIO_NOTION_USER_ID ?? 'gearit_demo';
  const p = b.payload; // operator review page = the FULL payload (internal, not the public one)
  const content = [
    `Blocked topics: ${p.topic_candidates.filter((t) => t.blocked).map((t) => `${t.topic} (${t.reason})`).join('; ') || 'none'}`,
    `Recommended: ${p.topic_candidates.filter((t) => !t.blocked).map((t) => t.topic).join('; ')}`,
    `Conflicts: ${p.conflicts.join(', ') || 'none'}`,
    `Locked decisions: ${p.locked_decisions.join('; ') || 'none'}`,
    `Open questions: ${p.open_questions.join('; ') || 'none'}`,
  ].join('\n');
  return composio.tools.execute('NOTION_CREATE_NOTION_PAGE', {
    userId,
    arguments: { parent_id: process.env.NOTION_PARENT_PAGE_ID, title: `GEARit blog_source_material — review`, content },
    dangerouslySkipVersionCheck: true, // manual execute rejects "latest" without this
  });
}
