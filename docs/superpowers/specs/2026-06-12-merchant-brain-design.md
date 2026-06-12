# Merchant Brain — Design Spec

*Ship to Prod Hackathon ("Context Engineering Challenge") — 2026-06-12*

> Working name: **Merchant Brain**. An autonomous agent that builds a merchant's
> **cited knowledge brain** from the open web, then runs the front half of Fond's
> *On-Site Blog Source Material Workflow for AEO* to emit a **Blog Source Material
> Packet** — logging every action to a measurement ledger so re-runs are
> incremental.

---

## 1. Problem & motivation

Fond helps SMB ecommerce merchants grow in the AI-discovery era; **AEO (Answer
Engine Optimization)** is the wedge. Per the current roadmap, the single biggest
problem is *"no AEO score movement — need to figure out which workflow actually
impacts this,"* against a hard **July 1, 2026** deadline (60-day money-back
guarantee for the first paying cohort: Wireless Place, GEARit, PerfectDD, Colour
Your Streets).

Two structural gaps block the AEO workflows:

1. **No grounded, per-merchant context.** Fond's `WebsiteProfile` is filled in
   manually at onboarding, injected into prompts *statically*, with no
   web-grounding and no citations. Workflows can't adapt to each merchant's real,
   provable, proprietary knowledge — which is exactly what makes content citeable.
2. **No memory of what's been tried.** The roadmap explicitly asks for *"a cleaner
   action ledger so every action is tied to a query cluster, hypothesis, ship date,
   and measured result."* Today that doesn't exist.

The blog-workflow playbook names the product directly:

> *"The durable product is a **company-brain-to-source-material workflow**, not a
> blog writer."*

This project prototypes the autonomous front half of that workflow.

## 2. What we're building

An autonomous agent that, given a merchant seed (name, URL, category):

1. **Researches the open web** and assembles a **cited Brain** (the playbook's
   *Input Packet* + *Evidence Pack*).
2. **Finds a real AEO opportunity** — a tracked query/mention gap where article-like
   sources are cited and the merchant has a right to win.
3. **Emits a Blog Source Material Packet** — 3–5 structured *article briefs* + one
   recommended first article, every claim cited.
4. **Acts on the web** — publishes the packet to **`cited.md`** (Senso) and pushes
   the top brief into **Notion** for merchant review (Composio).
5. **Remembers** — writes the action to a **ClickHouse** ledger; on re-run it reads
   the ledger + Brain, skips shipped work, and surfaces only new opportunities.

It runs live on **Render**, with a daily **cron** re-run (matching the playbook's
"queries run daily" cadence).

### Hackathon fit

- **Autonomous agent that acts on the open web** ✔ (multi-step web research →
  decision → publish/handoff action).
- **Grounded in ground-truth** ✔ (Senso citations; `cited.md`).
- **3+ sponsors** ✔ — five, each load-bearing (see §7).
- **Judging (5 × 20%):** Idea (real product Fond is scoping this week) ·
  Technical (web-research agent + grounded RAG + analytical ledger) · Tool Use
  (5 sponsors woven into one loop) · Demo (sharp before/after on a real merchant) ·
  Autonomy (research → score → act → re-measure, unattended on a cron).

## 3. Goals / non-goals

**Goals (today):**
- The full 6-step loop, end-to-end, on the real merchant **GEARit**.
- All five sponsors integrated and visible in the demo.
- A cited `cited.md` artifact + a real **Notion page** created by the agent.
- A **ClickHouse** action ledger that makes the re-run demonstrably incremental.
- Deployed on Render with a daily cron; a thin dashboard to narrate the demo.

**Non-goals (today — roadmap, not this build):**
- Live Shopify publishing + GSC/Bing index checks.
- Real multi-engine holdout measurement / statistical attribution (we record the
  ledger structure + a T+0 baseline; later checkpoints are placeholders).
- SME-interview UI (we instead emit the playbook's *"evidence still needed"* +
  article-specific interview questions as part of the brief).
- Full existing-blog-inventory crawler (light pass only).
- Auth, multi-tenant polish, billing.

## 4. The autonomous loop (data flow)

Each step names its primary sponsor and its input → output.

| # | Step | Sponsor | In → Out |
|---|------|---------|----------|
| 1 | **Build the Brain** — gather Input Packet + Evidence Pack from the open web (product/category, existing blog inventory, reviews, Reddit buyer questions, competitors' *cited* sources, an 8–12 sub-question fan-out per promising query). | **Anthropic** (Claude + `web_search`) | merchant seed → raw evidence + source URLs |
| 2 | **Ground & cite** — ingest the evidence into a citeable knowledge base; dedupe; attach citations. | **Senso** | raw evidence → cited Brain |
| 3 | **Opportunity scan (lite)** — run a handful of buyer queries to detect a mention/citation gap and identify the *current winning sources* and what they miss. | **Anthropic** (+ Senso for grounding) | Brain + query set → ranked gaps |
| 4 | **Citeability gates + scoring** — apply the playbook's hard gates (business fit, evidence availability, blog-surface plausibility, risk) then the 0–2 prioritization (gap × engine permeability, fan-out coverage, proprietary depth, citation volatility, measurement fit). | **Anthropic** | gaps + Brain → 1 chosen topic + score |
| 5 | **Emit the Packet** — generate 3–5 *article briefs* + one recommended first article using **absorption-first** structure (direct answer in first 100 words, question-form H2/H3, ≥3 proprietary proof points). Publish to `cited.md`. | **Senso** (cited gen + `cited.md`) | chosen topic + Brain → cited packet |
| 6 | **Act + log** — create a **Notion** review page for the top brief; write the action row (merchant, query cluster, hypothesis, ship ts, T+0 baseline) to the ledger. | **Composio** (action) + **ClickHouse** (ledger) | packet → Notion page + ledger row |

**Feedback loop:** the orchestrator first reads the ClickHouse ledger + the stored
Brain; already-shipped query clusters are excluded from step 3, so each run
compounds rather than repeats. **Render cron** triggers the loop daily.

The playbook's **two-stage retrieval** frame (Selection = will the page be
retrieved for the query + fan-out; Absorption = will its chunks be used in the
answer) drives both scoring (step 4) and the outline/structure rules (step 5).

## 5. Components

Small, single-purpose units with explicit interfaces. (Exact module paths land in
the implementation plan.)

- **Brain Builder** *(research agent)* — `seed → Brain`. Drives Claude with the
  `web_search` tool through a research checklist derived from the playbook's
  *Input Packet* + *Evidence Pack* lists. Emits structured findings with a source
  URL + snippet + retrievedAt per claim. Depends on: Anthropic.
- **Grounding Store** *(Senso adapter)* — `evidence → cited corpus`; `query →
  cited generation`; `packet → cited.md`. Depends on: Senso.
- **Opportunity Scanner** *(lite)* — `Brain + query set → ranked gaps`. Runs buyer
  queries, detects whether the merchant is mentioned/cited, captures the current
  cited sources. Depends on: Anthropic (+ Senso).
- **Citeability Scorer** — `gaps + Brain → chosen topic + score`. Pure logic over
  the playbook's gates + 5 scoring fields. No external deps.
- **Packet Generator** — `chosen topic + Brain → Blog Source Material Packet`
  (article briefs + recommended first article). Depends on: Senso (citations).
- **Action Publisher** *(Composio adapter)* — `top brief → Notion review page`.
  Depends on: Composio.
- **Action Ledger** *(ClickHouse adapter)* — `action → ledger row`; `merchant →
  prior actions` (for the feedback loop). Depends on: ClickHouse.
- **Orchestrator** — sequences steps 1–6, enforces the feedback-loop read, handles
  partial failure (a failed step degrades gracefully — see §9). Invoked by an API
  route and by the Render cron.
- **Dashboard** *(Next.js 16 App Router + shadcn)* — narrates the demo via a **live
  agent activity stream**: each step (researching → ingesting → scoring → generating
  → publishing → acting) and each citation appears as it happens, which makes the
  autonomy visible and absorbs the real latency (async Senso ingest + Claude search
  loops). Surfaces three **external proof artifacts** — the live `cited.md` page, the
  created **Notion** page, and the **ledger re-run diff** — plus the Brain with
  click-to-source citations.

## 6. Data model

Stored lean for the MVP: **ClickHouse** holds the action ledger + Brain/packet
snapshots; **Senso** holds the cited knowledge corpus + the published `cited.md`.
No Postgres/Prisma for this build.

**Brain** (mirrors + extends Fond's `WebsiteProfile`; every leaf fact carries a
citation):
```
Brain {
  merchant: { id, name, url, category }
  inputPacket: {
    queryClusters[], mentionGaps[], currentCitedUrls[], blogInventory[],
    alreadyCitedPages[], productCategoryPriorities[], buyerSubQuestions[]  // fan-out
  }
  evidencePack: {
    productSpecs[], reviews[], supportQuestions[], redditConversations[],
    founderExpertise[], proprietaryClaims[],  // ≥3 target
    visualsNeeded[]
  }
  citations: Citation[]   // { claimId, sourceUrl, snippet, retrievedAt, confidence }
  updatedAt
}
```

**ArticleBrief** (the playbook's step-5 schema):
```
ArticleBrief {
  merchant, workingTitle, targetQueryCluster, targetUserQuestion,
  whyThisShouldExist, currentWinningSources[], whatThoseSourcesMiss,
  merchantRightToWin, evidenceAvailable[], evidenceStillNeeded[],
  articleType, outline[], visualNeeds[], productsToReference[],
  internalLinks[], externalReferences[], claimsToAvoid[], reviewOwner,
  measurementPlan
}
```

**BlogSourceMaterialPacket** (the playbook's "Output Per Merchant"):
```
Packet {
  merchantContextSummary, opportunityScan, blogInventoryNotes,
  userDemandGapNotes, topicShortlist[], priorityRecommendation,
  evidenceRequestChecklist[], briefs: ArticleBrief[3..5],
  recommendedFirstArticle, measurementPlan, lessonsLearned, citedMdUrl
}
```

**ClickHouse ledger** — primary table `action_measurement`, **long/narrow** (one row
per checkpoint per engine), which keeps the re-run time-series and diff queries
simple:
```
action_id, merchant_id, query_cluster, action_type, output_ref (brief id / cited.md url),
ship_ts, checkpoint (T0|T3|T7|T14|T30|T60), measured_ts, engine (perplexity|chatgpt|claude),
mention_rate (Float32), cited (UInt8)
```
Connect with `@clickhouse/client` over secure HTTP port **8443** (`url` option, not
`host`); insert via `JSONEachRow`. (A wide `ReplacingMergeTree(action_ledger)` variant
with per-engine checkpoint arrays is the alternative; we use the narrow form.)

## 7. Sponsor integration (confirmed against docs, 2026-06-12)

Design holds; no architecture changes. Confirmed paths:

- **Anthropic — Claude + `web_search` server tool.** Enable with
  `tools:[{type:'web_search_20250305',name:'web_search',max_uses:15}]` (citations
  always on; read them off the text blocks). Org admin must toggle web search on in
  the Claude Console; handle the `pause_turn` stop_reason by resuming the turn.
  Drives steps 1, 3, 4 and drafting in 5.
- **Senso — grounded Brain + `cited.md`.** REST at `https://sdk.senso.ai/api/v1`
  (`X-API-Key`, server-side only). Flow: `POST /content/raw` to ingest each evidence
  item — **async**, poll `GET /content/{id}` until `processing_status==="completed"`
  → `POST /search` / `POST /generate` for grounded, cited output → publish via the
  CLI `senso engine publish` (needs a `geo_question_id`) to a live
  `cited.md/<handle>/<slug>` page. No first-party TS SDK → call REST with `fetch` or
  shell out to the CLI. **Why it matters:** cited.md pages are *agent-native* (HTML +
  structured payload + provenance), so publishing the packet makes the merchant's
  evidence directly citeable by answer engines — the whole AEO point.
- **Composio — the real action → Notion.** `@composio/core`, server-side:
  `composio.tools.execute('NOTION_CREATE_PAGE',{userId,arguments:{parent_id,title,content}})`.
  OAuth needs a **one-time** connected-account flow (`connectedAccounts.initiate` →
  redirect → callback on a public Render URL). **UX decision:** pre-connect Notion
  once before the demo; the live loop only calls `tools.execute`. Fallbacks:
  `GITHUB_CREATE_ISSUE` / `SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL`. Tool slugs/args
  aren't version-stable — confirm via `npx composio generate` / the catalog.
- **ClickHouse — action/measurement ledger.** `@clickhouse/client` over secure HTTP
  port **8443** (not native 9440), `url` option; long/narrow `action_measurement`
  table (§6); insert via `JSONEachRow` (async_insert for many small writes).
- **Render — host + autonomy.** Deploy as a **Web Service** (Node; build
  `npm install && npm run build`, start `npm run start`) + a **Cron Job**
  (`type: cron`, UTC schedule, **must exit**) for the daily re-run. Share secrets via
  an **Environment Group** linked to both; all durable state lives in ClickHouse
  (cron has no disk).

**One-time setup (front-loaded — see §10 step 0):** Senso key + a `geo_question_id`
prompt · Composio key + Notion Auth Config + connect the demo Notion workspace ·
ClickHouse Cloud service + `action_measurement` table · Anthropic key + web search
enabled in console · Render env group + GitHub repo connected.

## 8. Demo script (≈3 min)

1. **Hook (live gap):** ask a buyer query — *"best cat-6 ethernet cable for long
   runs"* — in an AI answer; show GEARit is **absent**, and a generic listicle /
   Reddit thread is cited instead.
2. **Unleash the agent:** enter `gearit.com`. Watch it autonomously web-search and
   assemble the **cited Brain** (specs, reviews, Reddit buyer questions, competitor
   cited sources) — each fact click-to-source.
3. **Opportunity + scoring:** it detects the gap, shows the *current winning
   sources and what they miss*, passes the hard gates, and scores the topic.
4. **The Packet:** it emits 3–5 **article briefs** + one recommended first article
   (absorption-first, ≥3 GEARit-proprietary proof points), published to
   **`cited.md`**.
5. **It acts:** a **Notion** review page appears (Composio); the action lands in the
   **ClickHouse** ledger.
6. **It remembers:** re-run → it reads the ledger, skips the shipped cluster, and
   surfaces a *new* opportunity. Runs daily on **Render** cron.

One-liner pitch: *"Fond can't move AEO scores because its workflows lack grounded,
per-merchant context and a memory of what's been tried. Merchant Brain is the
autonomous agent that builds both — and produces the blog source material Fond is
scoping by hand this week."*

## 9. Risks & mitigations

- **Time (same-day):** components are small and independently demoable; the
  orchestrator degrades gracefully — any failed step shows its last good output so
  the demo never hard-fails.
- **Senso `cited.md` specifics uncertain:** research pass + sponsor question; fallback
  is to render our own cited markdown and publish via the documented Senso surface.
- **Composio Notion auth fiddliness:** fallback action targets (GitHub issue / Slack).
- **Live "gap" detection flaky on stage:** deterministic check via `web_search`
  with a cached result for the demo query as a safety net.
- **Merchant-data sensitivity in a public repo:** use only public web information
  about GEARit; no Fond-internal credentials or private merchant data committed.
- **Async/latency mechanics:** Senso ingest is async (poll for `completed`) and
  Claude `web_search` can return `pause_turn` (resume to continue). The orchestrator
  and the activity-stream UX are built around this, not surprised by it.
- **One-time-setup risk:** each sponsor has setup friction (Senso prompt id, Composio
  OAuth connect, ClickHouse Cloud service, console toggle). Front-loaded as step 0 so
  it never blocks the live demo.

## 10. Build sequence (high level)

0. **One-time setup / prereqs:** provision all five sponsors — keys + ClickHouse
   Cloud service + `action_measurement` table + Composio Notion connect + Senso
   `geo_question_id` + Anthropic console web-search toggle + Render env group.
1. Scaffold app shell + env/secrets; ClickHouse `action_measurement` table.
2. Brain Builder (Claude `web_search`) → structured cited Brain.
3. Senso ingest + cited generation + `cited.md` publish.
4. Opportunity Scanner (lite) + Citeability Scorer.
5. Packet Generator (briefs + recommended article).
6. Composio → Notion action; write ledger row.
7. Orchestrator + feedback-loop read; thin dashboard.
8. Render deploy + daily cron.
9. Demo polish + cached safety nets + 3-min recording.

*Detailed, file-level steps are produced by the writing-plans pass after this spec
is approved.*
