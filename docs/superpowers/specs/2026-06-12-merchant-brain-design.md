# Merchant Brain — Design Spec

*Ship to Prod Hackathon ("Context Engineering Challenge") — 2026-06-12*

> **Merchant Brain** — a continuously-learning, evidence-backed context layer for each
> Fond merchant. An autonomous agent ingests merchant sources (live open-web research
> **and** ground-truth artifacts), extracts structured **observations**, maintains a
> field-level **canonical brain** with provenance, freshness, and **conflict**
> handling, and serves downstream AEO workflows a purpose-specific **context bundle** —
> proving the loop on a golden conflict scenario and publishing a cited brain summary
> to `cited.md`.

Re-centered (**v2**) on the partner's *Merchant Brain Context System* P0 spine — a
"truth-maintenance system with field-level state," not a summarized blob — while
keeping the hackathon's "agent acts on the open web" surface. Demo merchant: **GEARit**
(networking cables/adapters); we strip the minimal sanitized GEARit fixtures the
conflict scenario needs and let live web research supply the real open-web evidence.

---

## 1. Problem & motivation

Fond helps SMB ecommerce merchants grow in the AI-discovery era; **AEO (Answer Engine
Optimization)** is the wedge. The single biggest problem per the roadmap is *"no AEO
score movement,"* against a hard **July 1, 2026** deadline (money-back guarantee for
the first paying cohort).

Fond's workflows — query generation, citation analysis, GMC/schema optimization, and
the blog source-material workflow — are only as good as the merchant context they run
on. Today that context is **fragmented** across onboarding forms, Shopify/GMC, crawls,
Notion, calls, and one-off workflow artifacts, often not persisted. The cost is
**avoidable contradictions**: a later workflow forgets a merchant decision, reuses
stale catalog assumptions, regenerates known questions, or recommends something that
conflicts with a prior run. The roadmap already asks for *"a cleaner action ledger so
every action is tied to a query cluster, hypothesis, ship date, and measured result"*
and *"managing merchant-specific context so workflows adapt to each merchant."*

This builds the first **merchant brain**: an evidence-backed, recursively-updating
context substrate that becomes the shared memory layer those workflows consume. The
blog playbook names it — *"the durable product is a company-brain-to-source-material
workflow"* — and the blunt product take is *"a truth-maintenance system with
field-level state, not a beautiful pile of summarized artifacts."*

## 2. What we're building

**Two layers:**
- **Evidence layer** — immutable source records + raw artifacts: where a fact came
  from, when observed, which source/workflow produced it. The audit trail.
- **Canonical brain layer** — the current best **field-level** structured
  understanding, derived from evidence; every canonical fact links back to its
  evidence, with confidence, freshness, and conflict state. This is what workflows
  consume.

**The autonomous loop (the demo):**
1. **Ingest** sources — live open-web research (Claude `web_search` over GEARit's site,
   reviews, Reddit, competitors; Perplexity for the citation signal) **and**
   ground-truth artifacts (onboarding/profile, Shopify/GMC snapshot, a prior workflow
   artifact, an operator-decision log).
2. **Extract** structured **observations** — typed claims with `fact_key`, confidence,
   directness, evidence ref.
3. **Update** the canonical brain with provenance + freshness; **detect conflicts** by
   `fact_key`; route conflicting/low-confidence/high-impact facts to an **operator
   decision**; enforce the **lineage guardrail** (derived workflow outputs can't
   self-reinforce facts).
4. **Retrieve** a purpose-specific **context bundle** (`blog_source_material`) —
   relevant canonical facts + gaps + freshness warnings + conflicts + locked decisions
   + open questions + source refs.
5. **Publish / act** — a cited brain summary / bundle to `cited.md` (Senso, **public-safe facts
   only**); push the bundle + open questions to **Notion** (Composio).
   Daily re-run on **Render** cron.

**Hackathon fit:** autonomous agent that **acts on the open web** (live research +
cited publish + Notion action), grounded in ground-truth (Senso/`cited.md`), 5
sponsors, judged Idea / Technical / Tool-Use / Demo / Autonomy. The golden conflict
demo ("the brain stops a workflow from acting on a stale truth") is the sharp story.

## 3. Goals / non-goals

**Goals (v0, same-day):**
- Create a brain for **GEARit** from ~5 evidence sources (live web research + minimal
  stripped GEARit fixtures: onboarding/profile, Shopify/GMC snapshot, one prior
  workflow artifact, operator-decision log).
- Extract structured observations; update field-level canonical facts preserving
  source refs.
- Detect ≥1 **conflict** and surface it clearly.
- Prove the **golden scenario**: a stale/conflicting fact that *would* cause a bad blog
  pick is flagged/blocked before the bundle is used downstream.
- **Operator** review of proposed updates (approve / reject / supersede / **lock**);
  locked decisions can't be silently overwritten.
- Emit the `blog_source_material` **context bundle**; export cited Markdown + JSON.
- **Write-back**: ingest a *pre-made* write-back fixture (e.g. a citation-analysis
  artifact or operator note — **not** system-generated) → observations → visible
  canonical + bundle **before/after diff**.
- Publish a cited brain summary suitable for `cited.md`.
- Deployed on Render with a daily cron + a thin dashboard showing the "why this
  changed" trace.

**Non-goals (roadmap / out of scope):**
- **Don't rebuild blog generation** — produce the *context bundle*, not finished
  briefs. (May show ONE sample brief as downstream proof, clearly labeled.)
- Not every source connector — v0 uses the locked set (live web + stripped fixtures);
  no live Shopify/GMC connector required.
- No full Brain-Field-Definition policy engine — minimal field policies only (authority
  + freshness + lock).
- Operator workbench limited to approve/reject/supersede/lock/resolve + open questions.
- Freshness = a few rules (web/crawl stale >30d; catalog/GMC snapshot stale >7d;
  workflow artifacts never stale but supersedable; operator decisions never stale
  unless `expires_at`).
- No vector-memory blob; no autonomous merchant-facing recommendations; no sensitive
  data ingestion; no perfect truth adjudication (surface conflicts, operator confirms).

## 4. Architecture — the recursive loop (data flow)

| # | Step | Sponsor | In → Out |
|---|------|---------|----------|
| 1 | **Ingest sources** — register evidence (live web research + stripped fixtures) with type/timestamp/artifact ref; a failed ingest becomes a *visible* failed record. | **Anthropic** `web_search` + **Perplexity** (web) · fixtures | seed → `evidence_sources` |
| 2 | **Extract observations** — Claude extracts typed observations (`fact_key`, claim, structured_value, confidence, directness, evidence_ref, review_status); direct vs inferred; workflow-output = `derived`. | **Anthropic** | evidence → `observations` |
| 3 | **Synthesize canonical** — update `canonical_facts` by `fact_key` with provenance + freshness; **detect conflicts** (same key, differing values → `conflicted`); lineage guardrail; emit `update_events` (source→observation→canonical delta). | **Anthropic** + **ClickHouse** | observations → canonical + events |
| 4 | **Operator decision** — for conflicted/low-confidence/high-impact facts, operator confirms the winner → new `operator_decision` evidence source; **lock**. | human + **ClickHouse** | conflict → resolved + locked |
| 5 | **Context bundle** — assemble the `blog_source_material` bundle (facts + gaps + freshness warnings + conflicts + locked decisions + open questions + source refs); export MD+JSON. | **Anthropic** + **Senso** | brain → bundle |
| 6 | **Publish / act** — cited brain summary/bundle → `cited.md` (**public-safe facts only**); push bundle + open questions → **Notion**. | **Senso** + **Composio** | bundle → cited.md + Notion |

**Write-back:** ingest a new artifact (blog packet / operator decision) → observations
→ canonical delta → next bundle delta. **Render cron** re-runs daily (re-pull web,
re-extract, re-flag staleness/conflicts).

**Lineage guardrail:** every workflow artifact records the `brain_version_id` it used;
observations from it are `derived` and can't raise canonical confidence without new
external evidence or operator confirmation. The dashboard shows the
*source → observations → canonical delta → bundle delta* trace.

## 5. Components

- **Ingestion Envelope** — common path; `POST /merchant/:id/brain/sources` accepts an
  artifact upload/paste with `source_type`; registers an `evidence_source`; failed
  ingest = visible failed record.
- **Web Research Source** *(the web-acting surface)* — Claude `web_search` over
  GEARit's site/reviews/Reddit/competitors + a Perplexity citation check; emits
  evidence + source URLs. Depends on: Anthropic, Perplexity.
- **Observation Extractor** — `evidence → observations` (direct/inferred/derived;
  `needs_review` on weak claims). Depends on: Anthropic.
- **Brain Synthesizer** — `observations → canonical_facts`; conflict detection; lineage
  guardrail; writes `update_events`. Depends on: Anthropic, ClickHouse.
- **Operator Review (minimal)** — approve/reject/supersede/lock; resolve conflict →
  `operator_decision`; add open questions. Depends on: ClickHouse.
- **Context Bundle API** — `GET /merchant/:id/brain/context?purpose=blog_source_material`
  → compact facts + gaps + freshness + conflicts + locked decisions + open questions +
  source refs. Applies the **composition rule** that drops/flags any topic candidate
  referencing a product whose `sellable_status ∈ {excluded, eol, low_stock}`, and emits a
  **publish-safe subset** (public facts only). MD+JSON export. Depends on: Senso
  (citations).
- **Publish / Action** — cited summary/bundle → `cited.md` (Senso); bundle + open
  questions → Notion (Composio).
- **Orchestrator** — sequences ingest → extract → synthesize → bundle → publish;
  enforces the feedback-loop read; degrades gracefully on partial failure. API route +
  Render cron.
- **Dashboard** *(Next.js 16 + shadcn)* — live activity stream; evidence list +
  freshness; observations; canonical facts with confidence + conflict; review queue +
  locked decisions; the context bundle; the **before/after diff**; the **"why this
  changed" trace**. Three external proof artifacts: the `cited.md` page, the Notion
  page, the before/after bundle diff.

## 6. Data model

Lean v0: **ClickHouse** holds the append-only logs + canonical facts; **Senso** holds
the cited corpus + published `cited.md`. (No Postgres/Prisma for v0.) Connect with
`@clickhouse/client` over secure HTTP port **8443** (`url` option); insert
`JSONEachRow`.

- **`evidence_sources`** — merchant_id, source_id, source_type, source_name,
  source_uri/ref, artifact_hash, source_reliability, observed_at, ingested_at,
  created_by, **`privacy_class`** (`public_demo_safe`|`internal_only`|`merchant_confidential`
  — *single* privacy axis; `demo_safe` is derived as `privacy_class == public_demo_safe`),
  `produced_by_workflow` (nullable), `derived_from_brain_version_id` (nullable — set on
  workflow-output sources, for the lineage guardrail), freshness_policy, status
  (`pending|processed|failed|superseded`).
- **`observations`** — merchant_id, observation_id, source_id, fact_key,
  observation_type, claim, structured_value, extraction_confidence, directness
  (`direct|inferred|derived`), evidence_ref (quote/URL/row), `privacy_class` (inherited
  from source), observed_at, valid_from/until, extraction_method, review_status
  (`auto_accepted|needs_review|confirmed|rejected`).
- **`brain_versions`** — brain_version_id, merchant_id, parent_version_id, trigger
  (`ingest|write_back|operator_decision`), created_at. A version is stamped per run /
  write-back; `update_events` + `context_bundles` reference it so the before/after diff
  is queryable.
- **`canonical_facts`** (current state) — merchant_id, fact_key, section,
  canonical_value, canonical_confidence, supporting_observation_ids[],
  conflicting_observation_ids[], **`min_privacy`** (most-restrictive privacy across
  supporting evidence — drives publish redaction), last_updated_at, last_brain_version_id,
  freshness_status (`fresh|stale|missing|conflicted|operator_locked`), operator_locked,
  expires_at, review_status. *(`ReplacingMergeTree(last_updated_at)` ORDER BY
  `(merchant_id, fact_key)` = current truth; read `FINAL`. Historical state is
  reconstructable from `update_events` deltas + versioned `context_bundles`.)*
- **`update_events`** — event_id, merchant_id, brain_version_id, source_id,
  observation_id, fact_key, delta (before→after), `from_derived` (bool), created_at.
  *(The audit / "why changed" trace — also the roadmap's "what's been analyzed" ledger.)*
- **`operator_decisions`** — decision_id, merchant_id, fact_key, chosen_value,
  rationale, locked, expires_at, decided_by, created_at. *(Also written back as an
  `evidence_source`.)*
- **`context_bundles`** — bundle_id, merchant_id, purpose, brain_version_id,
  generated_at, source_cutoff_at, payload (facts/gaps/warnings/conflicts/locked/
  open_questions/source_refs), `published_payload` (publish-safe subset: only facts whose
  `min_privacy == public_demo_safe`; others omitted or surrogated), cited_md_url.

**v0 fact_keys (~12, scoped):** `identity.display_name`, `markets.primary_country`,
`catalog.priority_categories`, `catalog.products.<sku>.sellable_status`
(`sellable|low_stock|excluded|eol`), `catalog.source_of_truth`,
`buyer_language.common_objections`, `query.target_gaps`, `citation.cited_domains`,
`blog.topic_candidates`, `blog.proprietary_claim_candidates`, `decisions.open_questions`,
`schema.platform_constraints`.

**Golden conflict (GEARit — verified web-anchored).** GEARit's real, prominently-featured
hero category is the **Cat6 flat ethernet cable** (heavily merchandised on its site +
Amazon, thousands of reviews). Live web research independently surfaces it →
`blog.topic_candidates` favors *"best flat Cat6 ethernet cables"* and sets
`catalog.products.cat6_flat.sellable_status = sellable`. A **stripped internal fixture**
(GMC/Shopify snapshot + operator-decision log, marked `internal_only`) sets that *same
key* to `excluded` — *"deprioritized this quarter (high return rate); keep out of
content"* — a plausible **operational** decision, **not** a public claim about the
product. → `catalog.products.cat6_flat.sellable_status` goes **`conflicted`** → operator
confirms + **locks** `excluded`. **Bundle rule:** any `blog.topic_candidates` entry
referencing a product whose `sellable_status ∈ {excluded, eol, low_stock}` is
flagged/blocked — so the naive "best flat Cat6" pick is blocked and the next-best *real*
topic (e.g. the bestselling **Cat6 outdoor direct-burial** guide) is recommended. The
internal exclusion is `internal_only`, so it never reaches the published `cited.md`
(which carries only public-safe facts + the safe recommended topic).

## 7. Sponsor integration (doc-verified, 2026-06-12)

- **Anthropic** — `web_search` server tool
  (`tools:[{type:'web_search_20250305',name:'web_search',max_uses:15}]`; enable in the
  Claude Console; handle `pause_turn`) powers the live research source; Claude also does
  observation extraction, conflict detection, and bundle generation.
- **Senso** — cited brain + bundle → `cited.md`. **Runtime (hot path) = REST** at
  `https://apiv2.senso.ai/api/v1` (`X-API-Key`, server-side `fetch`): ingest
  `POST /org/kb/raw` (async — poll `GET /org/kb/nodes/{id}/content`), manage `/org/kb/*`.
  **Publish = the Senso CLI** (`senso engine publish`, needs a `geo_question_id`) →
  `cited.md/<handle>/<slug>`; add `@senso-ai/cli` as a dependency and invoke via
  `npx @senso-ai/cli …` / `child_process` from a **Node-runtime** Route Handler (not
  Edge). cited.md pages are agent-native (provenance) — fits the evidence-ref model.
  Confirm exact search/generate REST paths + the `sdk.senso.ai` alias in the signed-in
  API reference.
- **ClickHouse** — the evidence / observation / canonical / update-event store (the
  truth-maintenance substrate **and** the "what's been analyzed" ledger).
  `@clickhouse/client` over `url`:8443; canonical via `ReplacingMergeTree` (read
  `FINAL`); `JSONEachRow` inserts.
- **Composio** — the operator / publish action → Notion:
  `composio.tools.execute('NOTION_CREATE_NOTION_PAGE',{userId,arguments:{parent_id,title,content}})`
  (verified slug; resolve args via `npx composio generate`). **Pre-connect** the demo
  Notion workspace once via `connectedAccounts.link()` — Composio's **hosted** callback,
  so no public Render URL is needed and step-0 doesn't depend on the deploy (`initiate()`
  is being deprecated for managed OAuth) — or via the dashboard. The live loop only calls
  `tools.execute`. Fallbacks: `GITHUB_CREATE_ISSUE` / `SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL`.
- **Render** — Web Service (Node; build `npm install && npm run build`, start
  `npm run start`) + a Cron Job (`type: cron`, UTC, **must exit**) running
  `npm run agent:daily -- --merchant gearit`; share secrets via an Environment Group;
  all durable state in ClickHouse (cron has no disk).
- **Perplexity Sonar** *(non-sponsor, optional)* — a real answer-engine citation signal
  as a web evidence source (the playbook's best early signal). Cut to stay lean if
  time-pressed.

**One-time setup (front-loaded — §10 step 0):** Senso key + `geo_question_id` · Composio
key + Notion Auth Config + connect workspace · ClickHouse Cloud + tables · Anthropic key
+ web search enabled · (Perplexity key) · Render env group + repo · build the stripped
GEARit fixtures.

## 8. Demo script (≈3 min) — the golden scenario

*Pre-warm:* the heavy web research (beats 1–2) is run before the clock and the activity
stream is **replayed**, so the demo opens from a partly-formed brain. The **live core**
(beats 3–5) — conflict → operator lock → bundle blocks the bad pick — runs live and
deterministic. That sequence is the money shot; protect its airtime.

1. **Agent researches (autonomy front):** enter `gearit.com`; the agent autonomously
   web-searches the open web (site, reviews, Reddit, competitors), registers evidence,
   and surfaces *"best flat Cat6 ethernet cables"* as a topic candidate — live activity
   stream, click-to-source. *(pre-warmed / replayed)*
2. **Brain forms:** the agent extracts observations → canonical facts appear with
   confidence + freshness + source refs. *(pre-warmed / replayed)*
3. **Conflict — the agent detects + routes it (live):** the `internal_only` GMC/operator
   fixtures land; the agent flags `catalog.products.cat6_flat.sellable_status` as
   **`conflicted`** (web: sellable/hero vs internal: excluded) and escalates.
4. **Operator one-click confirm (human only ratifies):** lock `excluded` → saved as an
   `operator_decision` evidence source. The *agent* did the research, extraction, and
   conflict detection; the human just confirms the winner.
5. **Bundle proves the point (live):** request the `blog_source_material` bundle — the
   composition rule **blocks** the "best flat Cat6" topic (references an excluded
   product), shows the locked decision + open question, and recommends the next-best
   *real* topic (Cat6 outdoor direct-burial). *(Optional: one sample brief for the safe
   topic.)*
6. **Recursive write-back:** feed in a *pre-made* write-back fixture (a citation-analysis
   artifact or operator note) → new observations → **before/after bundle diff** (new
   proprietary-claim candidates + open questions); the "why this changed" trace shows the
   `derived` tag — the lineage guardrail visibly at work.
7. **Cited output + action:** publish the cited brain summary to **`cited.md`** —
   **public-safe facts only** (the internal exclusion is omitted); push the bundle + open
   questions to **Notion**. Runs daily on **Render** cron.

**Pitch:** *"Fond's Merchant Brain is an autonomous context-engineering agent: it
researches ground-truth merchant sources on the open web, maintains a cited,
field-level merchant memory, detects contradictions, and feeds the freshest
conflict-checked context into downstream AI commerce workflows — so a workflow never
acts on a stale truth again."*

## 9. Risks & mitigations

- **#1 — the conflict must actually fire (verify first):** the golden scenario only
  works if live web research independently surfaces the topic candidate the internal
  fixture contradicts. **Before building anything**, confirm the live GEARit web signal
  for the chosen product (done — Cat6 flat is a verified hero category) and **cache that
  research payload** so the web side is deterministic on stage — and make sure the cached
  payload actually contains the conflicting observation.
- **#2 — never publish the authored contradiction:** the "excluded" decision is fictional
  operational state about a real merchant. Its fixtures are `internal_only`; privacy
  propagates to `canonical_facts.min_privacy`; the publish step emits only
  `public_demo_safe` facts. No public `cited.md` page ever asserts a negative claim about
  a real GEARit product.
- **Scope (truth-maintenance is big):** cap at ~12 fact_keys, 1 demonstrated conflict,
  minimal operator controls, one bundle purpose — the partner doc's own v0 guardrails.
- **GEARit internal artifacts are authored:** minimal sanitized fixtures (onboarding /
  GMC snapshot / operator-decision), `internal_only`; live web supplies the real
  open-web evidence. ("Strip what's needed.")
- **"Acts on the web" must be retained:** live `web_search` research + `cited.md`
  publish + the Notion action are the web-acting surface; the truth-maintenance core
  alone wouldn't satisfy the hackathon theme.
- **Senso REST host/paths ambiguous:** drive Senso via the **CLI** (stable); fallback =
  render our own cited markdown + `senso engine publish`; ask the sponsor.
- **Composio Notion auth fiddliness:** pre-connect before the demo; fallbacks GitHub /
  Slack.
- **Self-reinforcement (lineage):** workflow-output sources carry `produced_by_workflow`
  + `derived_from_brain_version_id`; their observations are `directness=derived` and the
  synthesizer won't let them raise canonical confidence. Enforcement is the **cheap
  version** (a tag + a confidence rule), surfaced in the "why this changed" trace so it's
  demo-visible — no elaborate engine for v0.
- **Async/latency:** Senso ingest is async (poll); `web_search` can `pause_turn`
  (resume); the activity stream absorbs it.
- **Demo never hard-fails:** orchestrator degrades to last-good output; cached
  web/Perplexity responses back the live run.

## 10. Build sequence (mapped to our stack)

> `T#` = partner-doc task labels (cross-reference), **not** execution order — build in
> the numbered order below.

0. **Setup / prereqs (front-loaded):** **first, verify + cache the live GEARit web
   signal** for the chosen product and author the contradicting fixtures to match it
   (the demo's #1 risk). Then: keys + ClickHouse Cloud + tables + Composio Notion
   pre-connect (`connectedAccounts.link()`, hosted callback) + Senso `geo_question_id` +
   `@senso-ai/cli` installed + Anthropic web-search toggle + Render env group; build the
   stripped `internal_only` GEARit fixtures + operator-decision log.
1. **T1 Storage** — ClickHouse tables (`evidence_sources`, `observations`,
   `canonical_facts`, `brain_versions`, `update_events`, `operator_decisions`,
   `context_bundles`); stable `fact_key`s incl. the product-level
   `catalog.products.<sku>.sellable_status`; single `privacy_class` axis propagated to
   `canonical_facts.min_privacy`.
2. **T2 Ingestion envelope** — register sources (web + fixtures); failed = visible.
3. **Web research source** — Claude `web_search` (+ Perplexity) → evidence.
4. **T3 Observation extractor** — typed observations (direct/inferred/derived,
   needs_review).
5. **T4 Brain synthesizer** — canonical update + conflict detection + lineage +
   `update_events`.
6. **T6 Operator review (minimal)** — approve/lock/resolve → `operator_decision`.
7. **T5 Context bundle API** — `blog_source_material` bundle + MD/JSON export (Senso
   citations).
8. **T8 Publish action** — `cited.md` (Senso) + Notion (Composio).
9. **T7 Demo surface** — dashboard (evidence/freshness, canonical + conflict,
   review/locked, bundle, before/after diff, "why changed" trace).
10. Render deploy (Web Service) + daily Cron Job; demo polish + cached safety nets +
    3-min recording.

**Golden fixture acceptance:** fixture pack → expected canonical facts → expected
conflict → resolved operator decision → `blog_source_material` bundle → write-back →
before/after bundle diff → cited Markdown + JSON export.

*Detailed, file-level steps are produced by the writing-plans pass after this spec is
approved.*
