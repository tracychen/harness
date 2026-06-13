# Brainbox — a merchant brain for AEO

An autonomous agent that builds and maintains a **grounded, cited knowledge base** for a merchant, then serves it to downstream **AEO** (Answer Engine Optimization) workflows.

Chat with it; when it hits a gap it researches the open web, writes the new facts back, and answers.

Demo merchant live: https://merchant-brain.onrender.com/brain

---

## What it does

The loop: **collect → analyze → supplement → write back.**

- **Ask the brain** — a concise answer grounded only in stored facts, with `[fact_key]` citations. If it doesn't know, it says exactly what's missing.
- **Research the web & learn** — a live Anthropic `web_search` focused on your question extracts grounded observations (each with a source URL), reconciles them into canonical facts, and writes them back. The knowledge base grows in real time.
- **Publish** — the public-safe subset goes to **cited.md** (Senso); the full internal review goes to a **Notion** page (Composio).

Under the hood it's a truth-maintenance system: evidence → typed observations → field-level canonical facts with **provenance, confidence, freshness, conflict handling, and privacy classes**.

## Stack

| Layer                     | Tool                                                   |
| ------------------------- | ------------------------------------------------------ |
| Web research              | **Anthropic** `web_search`                             |
| Knowledge store           | **ClickHouse** (ReplacingMergeTree, read with `FINAL`) |
| Public publish → cited.md | **Senso**                                              |
| Notion action             | **Composio**                                           |
| App + API                 | **Next.js 16** (App Router, React 19, TypeScript)      |
| Deploy                    | **Render** (free web service)                          |
| Agent interface           | **MCP** server (stdio + hosted HTTP)                   |

## Architecture

Pure domain logic is side-effect-free and unit-tested; thin IO adapters wrap it.

```
lib/brain/
  types.ts           core types, privacy classes
  conflict.ts        pure conflict detection
  synthesize.ts      pure canonical-fact synthesis (conflict, lineage guardrail, privacy)
  bundle.ts          context-bundle composition + publish-safe filtering
  coverage.ts        known vs missing fact-key coverage
  chat.ts            grounded Q&A + research-and-learn (the agentic loop)
  clickhouse.ts      parameterized ClickHouse client
  ingest.ts          evidence + observation ingestion
  synthesizeRun.ts   IO: persist canonical facts / versions / events
  bundleRun.ts       IO: assemble + persist context bundles
  publish/senso.ts   cited.md publish (public-safe only)
  publish/notion.ts  Composio → Notion review page
  validate.ts        boundary validators + per-merchant domain allow-list
  mcpTools.ts        the 4 MCP tools (shared by stdio + HTTP)
app/
  brain/page.tsx                                  chat-first dashboard
  api/brain/{chat,context,run,operator,publish}   brain API routes
  api/mcp/route.ts                                hosted MCP endpoint
mcp/server.ts                                     local stdio MCP server
```

## Getting started

1. **Configure** — `cp .env.example .env.local` and fill in:

   ```
   ANTHROPIC_API_KEY=
   CLICKHOUSE_URL=https://<id>.<region>.<csp>.clickhouse.cloud:8443   # port 8443
   CLICKHOUSE_USER=default
   CLICKHOUSE_PASSWORD=
   SENSO_API_KEY=
   SENSO_GEO_QUESTION_ID
   COMPOSIO_API_KEY=
   COMPOSIO_NOTION_USER_ID=
   NOTION_AUTH_CONFIG_ID=
   NOTION_PARENT_PAGE_ID=
   MCP_TOKEN=                    # bearer token for the hosted MCP endpoint
   ```

2. **Create the tables** — `npm run db:setup`
3. **Run** — `npm run dev` → http://localhost:3000/brain
4. Click **Seed the brain from the web**, then start chatting.

> Standalone scripts load env via Node's `--env-file`, e.g.
> `node --env-file=.env.local --import tsx scripts/<name>.ts`

## Scripts

| Command                                | What                           |
| -------------------------------------- | ------------------------------ |
| `npm run dev` / `build` / `start`      | Next.js                        |
| `npm test`                             | Vitest unit suite (pure logic) |
| `npm run db:setup`                     | create the ClickHouse tables   |
| `npm run mcp`                          | stdio MCP server               |
| `npm run mcp:smoke` / `mcp:http-smoke` | MCP transport smoke tests      |

## Connect via MCP

The brain is also an MCP server exposing `brain_ask`, `brain_research`, `brain_get_context`, and `brain_get_coverage` — so any agent can mount it as a context source and even tell it to go learn.

**Local (stdio):**

```
claude mcp add merchant-brain -- node --env-file=/path/to/harness/.env.local --import tsx /path/to/harness/mcp/server.ts
```

**Hosted (HTTP):**

```
claude mcp add --transport http merchant-brain https://merchant-brain.onrender.com/api/mcp --header "Authorization: Bearer YOUR_MCP_TOKEN"
```

The hosted endpoint (`app/api/mcp/route.ts`) is a stateless streamable-HTTP transport, gated by `MCP_TOKEN` — set it before exposing the URL publicly.

## Deploy

`render.yaml` defines a free Render web service plus the `brain-secrets` env group (all the keys above, including `MCP_TOKEN`). After deploying, make sure **ClickHouse Cloud allows the instance's outbound IPs** (add `0.0.0.0/0` to the service's IP access list), or every brain action will fail to connect.

## Tests

`npm test` covers the deterministic core — conflict detection, synthesis, bundle composition + publish-safe filtering, coverage, and open-question tracking. IO adapters (ClickHouse, web research, Senso, Composio, MCP) are verified with smoke scripts against the real services.
