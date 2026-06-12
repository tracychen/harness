import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ContextBundle } from '../types';
const exec = promisify(execFile);

/** Render ONLY the publish-safe payload to markdown (internal facts already stripped upstream). */
export function bundleToMarkdown(b: ContextBundle): string {
  const p = b.published_payload;
  const facts = p.facts.map((f) => `- **${f.fact_key}**: ${f.value} _(confidence ${f.confidence})_`).join('\n');
  const topics = p.topic_candidates.filter((t) => !t.blocked).map((t) => `- ${t.topic}`).join('\n');
  return [
    `# GEARit — Brainbox Summary`,
    `## Recommended blog topics`, topics || '_none_',
    `## Cited facts`, facts || '_none_',
  ].join('\n\n');
}

/** Publish to cited.md via the Senso CLI (Node runtime only). Requires SENSO_API_KEY + SENSO_GEO_QUESTION_ID. */
export async function publishCited(b: ContextBundle): Promise<string> {
  const markdown = bundleToMarkdown(b);
  const data = JSON.stringify({
    geo_question_id: process.env.SENSO_GEO_QUESTION_ID,
    raw_markdown: markdown, seo_title: 'GEARit Brainbox Summary',
    summary: 'Cited, conflict-checked merchant context (public-safe).',
  });
  const { stdout } = await exec('npx', ['@senso-ai/cli', 'engine', 'publish', '--data', data, '--output', 'json', '--quiet'], {
    env: { ...process.env }, maxBuffer: 1024 * 1024,
  });
  // The CLI may print a human line (e.g. "✓ Content published.") before the JSON.
  const json = stdout.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const r = JSON.parse(json[0]);
      return r.publish_destinations?.[0]?.display_url
        ?? r.display_url
        ?? (r.content_id ? `https://cited.md/article/${r.content_id}` : stdout.trim());
    } catch { /* fall through to raw output */ }
  }
  return stdout.trim();
}
