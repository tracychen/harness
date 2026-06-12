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
5. **Publish / act** — a cited brain summary / bundle to `cited.md` (Senso, excluding
   `demo_safe=false`); push the bundle + open questions to **Notion** (Composio).
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
- **Write-back**: ingest a new artifact → observations → visible canonical + bundle
  **before/after diff**.
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
| 6 | **Publish / act** — cited brain summary/bundle → `cited.md` (demo-safe only); push bundle + open questions → **Notion**. | **Senso** + **Composio** | bundle → cited.md + Notion |

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
  source refs; MD+JSON export. Depends on: Senso (citations).
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
  created_by, privacy_class (`public_demo_safe`|`internal_only`|`merchant_confidential`),
  demo_safe, freshness_policy, status (`pending|processed|failed|superseded`).
- **`observations`** — merchant_id, observation_id, source_id, fact_key,
  observation_type, claim, structured_value, extraction_confidence, directness
  (`direct|inferred|derived`), evidence_ref (quote/URL/row), observed_at,
  valid_from/until, extraction_method, review_status
  (`auto_accepted|needs_review|confirmed|rejected`).
- **`canonical_facts`** — merchant_id, brain_version_id, fact_key, section,
  canonical_value, canonical_confidence, supporting_observation_ids[],
  conflicting_observation_ids[], last_updated_at, freshness_status
  (`fresh|stale|missing|conflicted|operator_locked`), operator_locked, expires_at,
  review_status. *(`ReplacingMergeTree(last_updated_at)` ORDER BY `(merchant_id,
  fact_key)`; read `FINAL`.)*
- **`update_events`** — event_id, merchant_id, brain_version_id, source_id,
  observation_id, fact_key, delta (before→after), created_at. *(The audit / "why
  changed" trace — also the roadmap's "what's been analyzed" ledger.)*
- **`operator_decisions`** — decision_id, merchant_id, fact_key, chosen_value,
  rationale, locked, expires_at, decided_by, created_at. *(Also written back as an
  `evidence_source`.)*
- **`context_bundles`** — bundle_id, merchant_id, purpose, brain_version_id,
  generated_at, source_cutoff_at, payload (facts/gaps/warnings/conflicts/locked/
  open_questions/source_refs), cited_md_url.

**v0 fact_keys (~12, scoped):** `identity.display_name`, `markets.primary_country`,
`catalog.priority_categories`, `catalog.excluded_products`, `catalog.source_of_truth`,
`buyer_language.common_objections`, `query.target_gaps`, `citation.cited_domains`,
`blog.topic_candidates`, `blog.proprietary_claim_candidates`, `decisions.open_questions`,
`schema.platform_constraints`.

**Golden conflict (GEARit):** live web research / site crawl says the **"Cat7 flat
cable"** is a hero product, in stock, with high buyer interest (→ `blog.topic_candidates`
favors it). But the **Shopify/GMC snapshot fixture** marks that SKU line
out-of-stock / disapproved, and the **operator-decision log** says *"exclude Cat7 flat —
EOL July 2026."* → `catalog.excluded_products` goes **`conflicted`** → operator confirms
+ **locks**. A naive blog pick ("best flat ethernet cables", featuring Cat7 flat) would
promote an EOL product; the `blog_source_material` bundle surfaces the conflict + the
locked exclusion + an open question, so the workflow avoids it and takes the next-best
topic.

## 7. Sponsor integration (doc-verified, 2026-06-12)

- **Anthropic** — `web_search` server tool
  (`tools:[{type:'web_search_20250305',name:'web_search',max_uses:15}]`; enable in the
  Claude Console; handle `pause_turn`) powers the live research source; Claude also does
  observation extraction, conflict detection, and bundle generation.
- **Senso** — cited brain + bundle → `cited.md`. Base `https://apiv2.senso.ai/api/v1`
  (`X-API-Key`, server-side); ingest `POST /org/kb/raw` (async — poll
  `GET /org/kb/nodes/{id}/content`); manage under `/org/kb/*`. **Primary surface = the
  CLI** (`senso kb` / `senso search` / `senso generate` / `senso engine publish`, which
  needs a `geo_question_id`) → live `cited.md/<handle>/<slug>`. cited.md pages are
  agent-native (HTML + structured payload + provenance) — fits the evidence-ref model.
  Confirm exact search/generate REST paths + the `sdk.senso.ai` alias in the signed-in
  API reference.
- **ClickHouse** — the evidence / observation / canonical / update-event store (the
  truth-maintenance substrate **and** the "what's been analyzed" ledger).
  `@clickhouse/client` over `url`:8443; canonical via `ReplacingMergeTree` (read
  `FINAL`); `JSONEachRow` inserts.
- **Composio** — the operator / publish action → Notion:
  `composio.tools.execute('NOTION_CREATE_NOTION_PAGE',{userId,arguments:{parent_id,title,content}})`
  (verified slug; resolve args via `npx composio generate`). One-time pre-connect of the
  demo Notion workspace before the demo; the live loop only calls `tools.execute`.
  Fallbacks: `GITHUB_CREATE_ISSUE` / `SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL`.
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

1. **Web-acting open:** enter `gearit.com`; the agent autonomously researches the open
   web (site, reviews, Reddit, competitors) and registers evidence — live activity
   stream, click-to-source.
2. **Brain forms:** observations are extracted → canonical facts appear with confidence
   + freshness + source refs.
3. **Conflict surfaces:** the Shopify/GMC snapshot + operator-decision fixtures land;
   `catalog.excluded_products` goes **`conflicted`** — web says "Cat7 flat = hero
   topic," ground truth says "EOL, exclude."
4. **Operator decides:** confirm + **lock** the exclusion → saved as an
   `operator_decision` evidence source.
5. **Bundle proves the point:** request the `blog_source_material` bundle — it **flags
   the conflict + locked exclusion + open question**, so the naive "best flat ethernet
   cable" pick is blocked and the next-best topic is recommended. *(Optional: show one
   sample brief for the safe topic.)*
6. **Recursive write-back:** ingest a short source-material packet → new observations →
   **before/after bundle diff** (adds proprietary-claim candidates + open questions).
7. **Cited output + action:** publish the cited brain summary to **`cited.md`**
   (demo-safe only); push the bundle + open questions to **Notion**. Runs daily on
   **Render** cron.

**Pitch:** *"Fond's Merchant Brain is an autonomous context-engineering agent: it
researches ground-truth merchant sources on the open web, maintains a cited,
field-level merchant memory, detects contradictions, and feeds the freshest
conflict-checked context into downstream AI commerce workflows — so a workflow never
acts on a stale truth again."*

## 9. Risks & mitigations

- **Scope (truth-maintenance is big):** cap at ~12 fact_keys, 1 demonstrated conflict,
  minimal operator controls, one bundle purpose — the partner doc's own v0 guardrails.
- **GEARit lacks internal artifacts:** construct minimal sanitized GEARit fixtures
  (onboarding / GMC snapshot / operator-decision) — small, plausible, `demo_safe=true`;
  live web supplies the real open-web evidence. ("Strip what's needed.")
- **"Acts on the web" must be retained:** live `web_search` research + `cited.md`
  publish + the Notion action are the web-acting surface; the truth-maintenance core
  alone wouldn't satisfy the hackathon theme.
- **Senso REST host/paths ambiguous:** drive Senso via the **CLI** (stable); fallback =
  render our own cited markdown + `senso engine publish`; ask the sponsor.
- **Composio Notion auth fiddliness:** pre-connect before the demo; fallbacks GitHub /
  Slack.
- **Self-reinforcement:** web + `cited.md` outputs are `derived`; can't raise canonical
  confidence without new external evidence or operator confirmation.
- **Async/latency:** Senso ingest is async (poll); `web_search` can `pause_turn`
  (resume); the activity stream absorbs it.
- **Demo never hard-fails:** orchestrator degrades to last-good output; cached
  web/Perplexity responses back the live run.

## 10. Build sequence (T1–T8, mapped to our stack)

0. **Setup / prereqs (front-loaded):** keys + ClickHouse Cloud + tables + Composio
   Notion connect + Senso `geo_question_id` + Anthropic web-search toggle + Render env
   group; build the 4 stripped GEARit fixtures + 1 operator-decision log.
1. **T1 Storage** — ClickHouse tables (`evidence_sources`, `observations`,
   `canonical_facts`, `update_events`, `operator_decisions`, `context_bundles`); stable
   `fact_key`s.
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
