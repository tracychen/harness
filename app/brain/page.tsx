'use client';

import { useState } from 'react';

type Topic = { topic: string; blocked: boolean; reason: string };
type Fact = { fact_key: string; value: string; min_privacy: string; freshness_status: string };
type Payload = {
  facts?: Fact[];
  conflicts?: string[];
  locked_decisions?: string[];
  open_questions?: string[];
  topic_candidates?: Topic[];
};
type Bundle = { payload?: Payload; published_payload?: Payload; brain_version_id?: string };
type Tone = 'agent' | 'brain' | 'ops' | 'publish' | 'warn';
type LogLine = { text: string; tone: Tone };

const api = {
  post: async (url: string, body: unknown) =>
    (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(),
  get: async (url: string) => (await fetch(url)).json(),
};

const shortKey = (k: string) => k.replace('catalog.products.', '').replace('.sellable_status', '');
const parseVal = (v: string) => {
  try { const o = JSON.parse(v); return o?.status ?? (Array.isArray(o) ? o.join(', ') : typeof o === 'object' ? JSON.stringify(o) : String(o)); }
  catch { return v; }
};

const TONE: Record<Tone, string> = {
  agent: 'text-sky-500',
  brain: 'text-primary',
  ops: 'text-amber-500',
  publish: 'text-emerald-500',
  warn: 'text-red-500',
};

export default function BrainPage() {
  const [log, setLog] = useState<LogLine[]>([]);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [prevTopics, setPrevTopics] = useState<Topic[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [cited, setCited] = useState<string | null>(null);
  const [notion, setNotion] = useState<boolean | null>(null);

  const say = (text: string, tone: Tone = 'agent') => setLog((l) => [...l, { text, tone }]);
  const finish = (s: string) => setDone((d) => ({ ...d, [s]: true }));

  const refresh = async (announce = true) => {
    try {
      const b: Bundle = await api.get('/api/brain/context?merchant=gearit');
      setBundle(b);
      if (announce && b?.payload?.conflicts?.length) {
        say(`⚠️ Conflict on ${b.payload.conflicts.map(shortKey).join(', ')} — the open web disagrees with internal ground truth`, 'warn');
      }
      return b;
    } catch { say('Could not load the bundle — is the API reachable?', 'warn'); return null; }
  };

  const wrap = (step: string, fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(step);
    try { await fn(); finish(step); }
    catch (e) { say(`Error: ${(e as Error).message}`, 'warn'); }
    finally { setBusy(null); }
  };

  const run = wrap('run', async () => {
    say('🔎 Agent researching the open web (gearit.com + Amazon) and ingesting internal ground-truth sources…', 'agent');
    const r = await api.post('/api/brain/run', { merchant: 'gearit' });
    say(`🧠 Synthesized brain ${String(r.brain_version_id || '').slice(0, 8)} · ${(r.changedKeys || []).length} canonical facts updated`, 'brain');
    await refresh();
  });

  const lock = wrap('lock', async () => {
    say('🔒 Operator reviews the conflict and locks the internal truth as canonical…', 'ops');
    await api.post('/api/brain/operator', {
      merchant: 'gearit',
      fact_key: 'catalog.products.cat6_flat.sellable_status',
      chosen_value: JSON.stringify({ status: 'excluded' }),
    });
    await refresh(false);
    say('🔒 cat6_flat locked to “excluded” — later web crawls can no longer overwrite it', 'ops');
  });

  const writeback = wrap('writeback', async () => {
    setPrevTopics(bundle?.payload?.topic_candidates ?? []);
    say('♻️ Feeding a downstream workflow artifact back into the brain (derived evidence)…', 'brain');
    await api.post('/api/brain/run', { merchant: 'gearit', mode: 'writeback' });
    await refresh(false);
    say('♻️ Brain grew — but derived evidence can’t out-rank ground truth (lineage guardrail)', 'brain');
  });

  const publish = wrap('publish', async () => {
    say('📤 Publishing the public-safe summary → cited.md (Senso) + the full internal review → Notion (Composio)…', 'publish');
    const r = await api.post('/api/brain/publish', { merchant: 'gearit' });
    setCited(typeof r.citedUrl === 'string' && r.citedUrl.startsWith('http') ? r.citedUrl : null);
    setNotion(!!r.notion);
    say(`✅ Published to cited.md · Notion review page ${r.notion ? 'created' : 'pending'}`, 'publish');
  });

  const p = bundle?.payload;
  const topics = p?.topic_candidates ?? [];
  const conflicts = p?.conflicts ?? [];
  const locked = p?.locked_decisions ?? [];
  const openQs = p?.open_questions ?? [];
  const intFacts = p?.facts?.length ?? 0;
  const pubFacts = bundle?.published_payload?.facts?.length ?? 0;
  const hasConflict = conflicts.length > 0;
  const isNew = (t: Topic) => !!prevTopics && !prevTopics.some((x) => x.topic === t.topic);

  const steps = [
    { id: 'run', n: 1, title: 'Run the agent', desc: 'Researches the open web and reconciles it against internal ground truth into field-level, cited canonical facts.', cta: 'Run agent', onClick: run, primary: true, enabled: true },
    { id: 'lock', n: 2, title: 'Resolve & lock the conflict', desc: 'The web says “sellable”, internal truth says “excluded”. The operator confirms and locks the canonical fact.', cta: 'Confirm + lock', onClick: lock, primary: false, enabled: hasConflict || !!done.lock },
    { id: 'writeback', n: 3, title: 'Write-back a workflow artifact', desc: 'A downstream workflow feeds derived findings back in — the lineage guardrail stops them self-reinforcing.', cta: 'Write-back', onClick: writeback, primary: false, enabled: !!bundle },
    { id: 'publish', n: 4, title: 'Publish (public-safe)', desc: 'Only public-safe facts reach cited.md; the full internal review (conflicts, locks) goes to a Notion page.', cta: 'Publish', onClick: publish, primary: false, enabled: !!bundle },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b border-border pb-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="inline-block h-2 w-2 bg-primary" /> Merchant Brain · Context Engineering
          </div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">The GEARit Merchant Brain</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            An autonomous agent that researches the open web, reconciles it against internal ground truth into a{' '}
            <span className="text-foreground">cited, conflict-checked knowledge base</span>, and serves a citation-ready
            context bundle to downstream AEO workflows — while{' '}
            <span className="text-foreground">never leaking internal data</span> to the public web.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            {['Anthropic · web_search', 'ClickHouse', 'Senso · cited.md', 'Composio · Notion'].map((s) => (
              <span key={s} className="border border-border bg-card px-2.5 py-1 text-muted-foreground">{s}</span>
            ))}
          </div>
        </header>

        <div className="mt-6 border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <div className="font-semibold text-amber-600">The scenario to watch</div>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            GEARit’s site &amp; Amazon list its <span className="text-foreground">flat Cat6 cable</span> as an in-stock hero
            product. But the internal catalog marks that SKU <span className="text-foreground">excluded</span> this quarter.
            Watch the brain catch the conflict, let ops lock the truth, and{' '}
            <span className="text-foreground">refuse to feature the stale topic</span> — while still publishing everything
            that’s safe.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="space-y-6">
            <div className="border border-border bg-card">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold">Run the loop</div>
              <ol className="divide-y divide-border">
                {steps.map((s) => {
                  const isBusy = busy === s.id;
                  const complete = done[s.id];
                  return (
                    <li key={s.id} className="flex items-start gap-4 px-5 py-4">
                      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border text-sm font-semibold ${complete ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600' : 'border-border bg-muted text-muted-foreground'}`}>
                        {complete ? '✓' : s.n}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">{s.title}</div>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
                      </div>
                      <button
                        onClick={s.onClick}
                        disabled={!!busy || !s.enabled}
                        className={`shrink-0 px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${s.primary ? 'bg-primary text-primary-foreground hover:opacity-90' : 'border border-border bg-background hover:bg-muted'}`}
                      >
                        {isBusy ? 'Working…' : complete ? 'Run again' : s.cta}
                      </button>
                    </li>
                  );
                })}
              </ol>
              <div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
                <span>Deterministic demo — web research replays a captured snapshot.</span>
                <button onClick={() => refresh()} disabled={!!busy} className="underline underline-offset-2 hover:text-foreground">refresh bundle</button>
              </div>
            </div>

            <div className="border border-border bg-card">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold">Activity</div>
              <div className="max-h-72 overflow-auto px-5 py-3 text-xs leading-relaxed">
                {log.length === 0 ? (
                  <p className="text-muted-foreground">No activity yet — start with <span className="text-foreground">Run agent</span>.</p>
                ) : (
                  <ul className="space-y-1.5">{log.map((l, i) => <li key={i} className={TONE[l.tone]}>{l.text}</li>)}</ul>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="text-sm font-semibold">Context bundle · blog_source_material</span>
                {bundle?.brain_version_id && <span className="text-xs text-muted-foreground">v{String(bundle.brain_version_id).slice(0, 8)}</span>}
              </div>
              <div className="space-y-5 px-5 py-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Blog topic candidates</span>
                    <span className="lowercase">🚫 blocked · ✅ eligible</span>
                  </div>
                  {topics.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Run the agent to surface topics from live web research.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {topics.map((t, i) => (
                        <li key={i} className={`flex items-start gap-2 border-l-2 px-3 py-2 text-xs ${t.blocked ? 'border-red-500/60 bg-red-500/10' : 'border-emerald-500/60 bg-emerald-500/10'}`}>
                          <span>{t.blocked ? '🚫' : '✅'}</span>
                          <div className="flex-1">
                            <div className="font-medium text-foreground">
                              {t.topic}
                              {isNew(t) && <span className="ml-2 bg-emerald-600 px-1 py-0.5 text-[10px] font-semibold text-white">NEW</span>}
                            </div>
                            <div className={t.blocked ? 'text-red-600' : 'text-muted-foreground'}>{t.reason}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-border p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conflicts</div>
                    {conflicts.length
                      ? conflicts.map((c) => <div key={c} className="mt-1 text-xs text-amber-600">⚠️ {shortKey(c)}</div>)
                      : <div className="mt-1 text-xs text-muted-foreground">none</div>}
                  </div>
                  <div className="border border-border p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Locked truth</div>
                    {locked.length
                      ? locked.map((d) => <div key={d} className="mt-1 text-xs text-primary">🔒 {shortKey(d.split('=')[0])} = {parseVal(d.split('=').slice(1).join('='))}</div>)
                      : <div className="mt-1 text-xs text-muted-foreground">none</div>}
                  </div>
                </div>

                {openQs.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open questions</div>
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{openQs.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </div>
                )}
              </div>
            </div>

            <div className="border border-border bg-card">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold">Publish boundary</div>
              <div className="px-5 py-4 text-xs">
                <p className="leading-relaxed text-muted-foreground">
                  Internal facts — conflicts, locked exclusions, confidential data — are stripped before anything reaches the
                  public web. The brain emits two views from the same truth:
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="border border-border p-3">
                    <div className="font-semibold">Internal bundle</div>
                    <div className="mt-1 text-2xl font-bold">{intFacts}</div>
                    <div className="text-muted-foreground">facts · incl. conflicts &amp; locks · for ops + workflows</div>
                  </div>
                  <div className="border border-emerald-500/40 bg-emerald-500/5 p-3">
                    <div className="font-semibold text-emerald-600">Published · cited.md</div>
                    <div className="mt-1 text-2xl font-bold text-emerald-600">{pubFacts}</div>
                    <div className="text-muted-foreground">public-safe facts only · 0 internal</div>
                  </div>
                </div>
                {cited && (
                  <a href={cited} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-emerald-600 underline underline-offset-2 hover:opacity-80">
                    🔗 View the live cited.md article
                  </a>
                )}
                {notion && <div className="mt-1.5 text-muted-foreground">🗒️ Notion review page created with the full internal payload.</div>}
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-10 border-t border-border pt-5 text-xs text-muted-foreground">
          Merchant Brain v0 · a grounded knowledge layer for Answer Engine Optimization · Anthropic · ClickHouse · Senso · Composio
        </footer>
      </div>
    </div>
  );
}
