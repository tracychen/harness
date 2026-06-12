'use client';
import { useState } from 'react';

type Json = Record<string, unknown>;
async function post(url: string, body: Json) { return (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); }
async function get(url: string) { return (await fetch(url)).json(); }

export default function BrainPage() {
  const [log, setLog] = useState<string[]>([]);
  const [bundle, setBundle] = useState<any>(null);
  const [prevTopics, setPrevTopics] = useState<any[] | null>(null);
  const say = (m: string) => setLog((l) => [...l, `${m}`]);

  const run = async () => { say('🔎 agent researching + ingesting…'); const r = await post('/api/brain/run', { merchant: 'gearit' }); say(`🧠 brain v=${String(r.brain_version_id).slice(0, 8)} changed=${(r.changedKeys || []).join(', ')}`); await refresh(); };
  const refresh = async () => { const b = await get('/api/brain/context?merchant=gearit'); setBundle(b); if (b?.payload?.conflicts?.length) say(`⚠️ conflict: ${b.payload.conflicts.join(', ')}`); };
  const lock = async () => { say('🔒 operator confirms + locks excluded'); await post('/api/brain/operator', { merchant: 'gearit', fact_key: 'catalog.products.cat6_flat.sellable_status', chosen_value: JSON.stringify({ status: 'excluded' }) }); await refresh(); };
  const writeback = async () => { setPrevTopics(bundle?.payload?.topic_candidates ?? null); say('♻️ write-back artifact ingested'); await post('/api/brain/run', { merchant: 'gearit', mode: 'writeback' }); await refresh(); };
  const publish = async () => { say('📤 publishing public-safe summary → cited.md + Notion'); const r = await post('/api/brain/publish', { merchant: 'gearit' }); say(`✅ cited.md: ${r.citedUrl ?? 'see logs'} · Notion: ${r.notion ? 'created' : 'see logs'}`); };

  const topics = bundle?.payload?.topic_candidates ?? [];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 24, fontFamily: 'ui-monospace, monospace' }}>
      <div>
        <h2>Merchant Brain — GEARit</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={run}>1. Run agent</button>
          <button onClick={lock}>2. Confirm + lock</button>
          <button onClick={refresh}>3. Build bundle</button>
          <button onClick={writeback}>4. Write-back</button>
          <button onClick={publish}>5. Publish</button>
        </div>
        <h3>Activity</h3>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>
      </div>
      <div>
        <h3>blog_source_material bundle</h3>
        <h4>Topic candidates</h4>
        <ul>
          {topics.map((t: any, i: number) => (
            <li key={i} style={{ color: t.blocked ? '#b00' : '#070' }}>{t.blocked ? '🚫' : '✅'} {t.topic} <em>({t.reason})</em>{prevTopics && !prevTopics.find((p) => p.topic === t.topic) ? ' 🆕' : ''}</li>
          ))}
        </ul>
        <h4>Conflicts / locked</h4>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ conflicts: bundle?.payload?.conflicts, locked: bundle?.payload?.locked_decisions, open_questions: bundle?.payload?.open_questions }, null, 2)}</pre>
      </div>
    </div>
  );
}
