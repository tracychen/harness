'use client';

import { useEffect, useRef, useState } from 'react';

type Fact = { fact_key: string; value: string; min_privacy: string; freshness_status: string; confidence: number; source_refs: string[] };
type Msg = { role: 'you' | 'brain' | 'note'; text: string };

const api = {
  post: async (url: string, body: unknown) =>
    (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(),
  get: async (url: string) => (await fetch(url)).json(),
};

const shortKey = (k: string) => k.replace(/^catalog\.products\./, '').replace(/\.sellable_status$/, '');
const parseVal = (v: string) => {
  try { const o = JSON.parse(v); return o?.status ?? (Array.isArray(o) ? o.join(', ') : typeof o === 'object' ? Object.values(o).join(', ') : String(o)); }
  catch { return v; }
};

const SUGGESTIONS = [
  'What does GEARit sell, and who buys it?',
  'What makes GEARit different from generic Amazon cables?',
  'What blog topics should we write to win AEO citations?',
  'What’s missing from the brain right now?',
];

export default function BrainPage() {
  const [merchant] = useState('gearit');
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState<'ask' | 'research' | 'publish' | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [version, setVersion] = useState<string | null>(null);
  const [learned, setLearned] = useState<Set<string>>(new Set());
  const [cited, setCited] = useState<string | null>(null);
  const [notion, setNotion] = useState<boolean | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const refreshBrain = async () => {
    try {
      const b = await api.get(`/api/brain/context?merchant=${merchant}`);
      setFacts((b?.payload?.facts ?? []) as Fact[]);
      if (b?.brain_version_id) setVersion(String(b.brain_version_id));
    } catch { /* ignore */ }
  };

  useEffect(() => { refreshBrain(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { threadRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }); }, [msgs]);

  const send = async (mode: 'ask' | 'research', text?: string) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'you', text: message }]);
    setBusy(mode);
    if (mode === 'research') setMsgs((m) => [...m, { role: 'note', text: '🔎 Researching the open web and writing what it finds back into the brain…' }]);
    try {
      const r = await api.post('/api/brain/chat', { merchant, message, mode });
      if (mode === 'research') {
        const keys: string[] = r.learned ?? [];
        setLearned(new Set(keys));
        setMsgs((m) => [...m, { role: 'note', text: `✅ ${r.researchSummary ?? 'Done.'}${keys.length ? ' · ' + keys.map(shortKey).join(', ') : ''}` }]);
        await refreshBrain();
      }
      setMsgs((m) => [...m, { role: 'brain', text: r.answer ?? r.error ?? '(no answer)' }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'brain', text: `Error: ${(e as Error).message}` }]);
    } finally { setBusy(null); }
  };

  const publish = async () => {
    if (busy) return;
    setBusy('publish');
    setMsgs((m) => [...m, { role: 'note', text: '📤 Publishing the public-safe summary → cited.md (Senso) + an internal review page → Notion (Composio)…' }]);
    try {
      const r = await api.post('/api/brain/publish', { merchant });
      setCited(typeof r.citedUrl === 'string' && r.citedUrl.startsWith('http') ? r.citedUrl : null);
      setNotion(!!r.notion);
      setMsgs((m) => [...m, { role: 'note', text: `✅ Published to cited.md · Notion review page ${r.notion ? 'created' : 'pending'}` }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'note', text: `Publish error: ${(e as Error).message}` }]);
    } finally { setBusy(null); }
  };

  const sections = Array.from(new Set(facts.map((f) => f.fact_key.split('.')[0])));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-9">
        <header className="border-b border-border pb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            <span className="inline-block h-2 w-2 bg-primary" /> Merchant Brain · Context Engineering
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">The GEARit Merchant Brain</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Chat with a <span className="text-foreground">grounded knowledge base</span> that answers only from stored,
            cited facts. When it hits a gap, it <span className="text-foreground">researches the open web</span>, writes
            the new facts back, and answers — building the brain that feeds downstream AEO workflows.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {['Anthropic · web_search', 'ClickHouse', 'Senso · cited.md', 'Composio · Notion'].map((s) => (
              <span key={s} className="border border-border bg-card px-2.5 py-1 text-muted-foreground">{s}</span>
            ))}
          </div>
        </header>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
          {/* CHAT */}
          <section className="flex h-[36rem] flex-col border border-border bg-card">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold">Ask the brain</div>

            <div ref={threadRef} className="flex-1 space-y-3 overflow-auto px-5 py-4 text-sm">
              {msgs.length === 0 && (
                <div className="text-muted-foreground">
                  <p>Ask anything about GEARit. Try one of these:</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send('ask', s)} disabled={!!busy}
                        className="border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted disabled:opacity-40">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) =>
                m.role === 'note' ? (
                  <div key={i} className="text-xs italic text-muted-foreground">{m.text}</div>
                ) : (
                  <div key={i} className={m.role === 'you' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] whitespace-pre-wrap px-3 py-2 text-sm ${m.role === 'you' ? 'bg-primary text-primary-foreground' : 'border border-border bg-background'}`}>
                      {m.role === 'brain' && <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">brain</div>}
                      {m.text}
                    </div>
                  </div>
                ),
              )}
              {busy && busy !== 'publish' && <div className="text-xs italic text-muted-foreground">{busy === 'research' ? 'searching the web…' : 'thinking…'}</div>}
            </div>

            <div className="border-t border-border p-3">
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') send('ask'); }}
                  placeholder="Ask the brain…"
                  disabled={!!busy}
                  className="flex-1 border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                />
                <button onClick={() => send('ask')} disabled={!!busy || !input.trim()}
                  className="bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">Ask</button>
              </div>
              <button onClick={() => send('research')} disabled={!!busy || !input.trim()}
                className="mt-2 w-full border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-40">
                🔎 Research the web &amp; learn — answer this from a live web_search, then save it to the brain
              </button>
            </div>
          </section>

          {/* BRAIN STATE */}
          <section className="flex h-[36rem] flex-col border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-sm font-semibold">Knowledge base</span>
              <span className="text-xs text-muted-foreground">{facts.length} facts{version ? ` · v${version.slice(0, 8)}` : ''}</span>
            </div>

            <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
              {facts.length === 0 ? (
                <p className="text-xs text-muted-foreground">The brain is empty. Ask a question, then hit <span className="text-foreground">Research the web &amp; learn</span> to teach it.</p>
              ) : (
                sections.map((sec) => (
                  <div key={sec}>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{sec}</div>
                    <ul className="space-y-1">
                      {facts.filter((f) => f.fact_key.split('.')[0] === sec).map((f) => {
                        const isNew = learned.has(f.fact_key);
                        const internal = f.min_privacy !== 'public_demo_safe';
                        return (
                          <li key={f.fact_key} className={`border-l-2 px-3 py-1.5 text-xs ${isNew ? 'border-emerald-500 bg-emerald-500/10' : 'border-border bg-background'}`}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{shortKey(f.fact_key).split('.').slice(1).join('.') || shortKey(f.fact_key)}</span>
                              {internal && <span title="internal only — never published" className="text-[10px] text-amber-500">🔒 internal</span>}
                              {isNew && <span className="bg-emerald-600 px-1 text-[9px] font-semibold text-white">NEW</span>}
                            </div>
                            <div className="text-muted-foreground">{parseVal(f.value)}</div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-border p-3">
              <button onClick={publish} disabled={!!busy || facts.length === 0}
                className="w-full border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-40">
                {busy === 'publish' ? 'Publishing…' : '📤 Publish public-safe summary → cited.md + Notion'}
              </button>
              {cited && <a href={cited} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-emerald-600 underline underline-offset-2">🔗 View the live cited.md article</a>}
              {notion && <div className="mt-1 text-xs text-muted-foreground">🗒️ Notion review page created.</div>}
            </div>
          </section>
        </div>

        <footer className="mt-8 border-t border-border pt-5 text-xs text-muted-foreground">
          Every answer is grounded in stored, cited, freshness-tracked facts — and internal facts never reach the public web.
          Merchant Brain v0
        </footer>
      </div>
    </div>
  );
}
