# Merchant Brain v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Merchant Brain v0 — an autonomous agent that researches the open web, maintains a field-level cited canonical brain with conflict handling, and serves a `blog_source_material` context bundle that blocks a stale-truth blog pick — demoed on GEARit.

**Architecture:** Pure domain logic (conflict detection, synthesis, bundle composition, privacy propagation) lives in side-effect-free functions over typed objects and is unit-tested. Thin IO adapters (ClickHouse, Anthropic `web_search`, Senso, Composio) wrap those functions and are verified with smoke scripts against real services. A Next.js 16 App Router dashboard narrates the loop; a Render cron re-runs it daily.

**Tech Stack:** Next.js 16 (App Router, TypeScript, React 19), `@clickhouse/client`, `@anthropic-ai/sdk` (web_search server tool), `@composio/core`, `@senso-ai/cli` + Senso REST, Vitest (tests), deployed on Render.

**Testing strategy (pragmatic TDD):** TDD the deterministic core (Phases 1–2, 5) where bugs would silently kill the demo and tests are cheap. For external-API adapters, write thin adapters + a real smoke script (no mocked-API unit tests — they give false confidence). The golden-fixture acceptance run (Task 18) is the end-to-end gate.

**Phasing (front-loads the money shot):** P0 setup → P1 storage → **P2 brain logic (conflict/synthesis/bundle = the demo's brain)** → P3 research+ingest → P4 extract+synthesize → P5 operator+bundle API → P6 publish/action → P7 orchestrator+dashboard → P8 deploy+polish. Execution can stop at P7 and still demo locally.

---

## File Structure

```
lib/brain/
  types.ts              Core types, privacy enum + helpers, fact-key constants
  clickhouse.ts         ClickHouse client + typed insert/query helpers
  ddl.ts                CREATE TABLE statements (one per table)
  conflict.ts           Pure: detect same-fact_key value conflicts
  synthesize.ts         Pure: canonical upsert decision (conflict, lineage, min_privacy)
  bundle.ts             Pure: blog_source_material assembly + composition rule + publish-safe subset
  ingest.ts             Ingestion envelope: register an evidence_source (+ raw observations)
  extract.ts            Observation extractor (Claude structured output)
  research/
    websearch.ts        Anthropic web_search adapter (+ cached fixture replay)
  publish/
    senso.ts            Senso REST ingest + CLI publish to cited.md
    notion.ts           Composio NOTION_CREATE_NOTION_PAGE action
  operator.ts           Resolve conflict + lock → operator_decision evidence source
  synthesizeRun.ts      IO: wire pure synthesize → ClickHouse (+ brain_versions, update_events)
  bundleRun.ts          IO: assemble + persist context_bundles
  orchestrator.ts       Sequence ingest→extract→synthesize→bundle→publish
fixtures/gearit/
  onboarding.json       public_demo_safe profile
  gmc-snapshot.json     internal_only — sets cat6_flat sellable_status=excluded
  operator-decision.json internal_only
  writeback.json        pre-made write-back fixture
  cached-research.json  cached web_search payload (contains the conflicting observation)
app/
  api/brain/run/route.ts            POST: run the loop for a merchant
  api/brain/context/route.ts        GET: ?purpose=blog_source_material
  api/brain/operator/route.ts       POST: resolve+lock a conflict
  brain/page.tsx                    Dashboard
  brain/components/*.tsx            ActivityStream, FactsTable, ConflictPanel, BundleView, DiffView, WhyTrace
scripts/
  setup-clickhouse.ts   Create all tables
  daily-rerun.ts        Render cron entry (npm run agent:daily)
  smoke-*.ts            One smoke script per adapter
vitest.config.ts
.env.example
```

---

## Task 1: Project setup — test runner, scripts, env

**Files:**
- Create: `vitest.config.ts`
- Create: `.env.example`
- Modify: `package.json` (scripts + deps)

- [ ] **Step 1: Install dev/runtime deps**

Run:
```bash
npm i @clickhouse/client @anthropic-ai/sdk @composio/core @senso-ai/cli
npm i -D vitest @vitest/coverage-v8 tsx
```
Expected: packages added to `package.json`.

- [ ] **Step 2: Add `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
    globals: true,
  },
});
```

- [ ] **Step 3: Add npm scripts**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest",
"db:setup": "tsx scripts/setup-clickhouse.ts",
"agent:daily": "tsx scripts/daily-rerun.ts"
```

- [ ] **Step 4: Add `.env.example`**

```bash
ANTHROPIC_API_KEY=
CLICKHOUSE_URL=https://<id>.<region>.<csp>.clickhouse.cloud:8443
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
SENSO_API_KEY=tgr_live_
SENSO_GEO_QUESTION_ID=
COMPOSIO_API_KEY=
COMPOSIO_NOTION_USER_ID=gearit_demo
NOTION_PARENT_PAGE_ID=
PERPLEXITY_API_KEY=
```

- [ ] **Step 5: Verify test runner runs**

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (no tests yet).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.example
git commit -m "chore: add vitest, brain deps, env scaffold"
```

---

## Task 2: Core types + privacy helpers (TDD)

**Files:**
- Create: `lib/brain/types.ts`
- Test: `lib/brain/privacy.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/brain/privacy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isDemoSafe, mostRestrictive, type PrivacyClass } from './types';

describe('privacy', () => {
  it('only public_demo_safe is demo safe', () => {
    expect(isDemoSafe('public_demo_safe')).toBe(true);
    expect(isDemoSafe('internal_only')).toBe(false);
    expect(isDemoSafe('merchant_confidential')).toBe(false);
  });

  it('mostRestrictive returns the stricter of two classes', () => {
    expect(mostRestrictive('public_demo_safe', 'internal_only')).toBe('internal_only');
    expect(mostRestrictive('internal_only', 'merchant_confidential')).toBe('merchant_confidential');
    expect(mostRestrictive('public_demo_safe', 'public_demo_safe')).toBe('public_demo_safe');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/brain/privacy.test.ts`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 3: Write `lib/brain/types.ts`**

```ts
export type PrivacyClass = 'public_demo_safe' | 'internal_only' | 'merchant_confidential';
const PRIVACY_RANK: Record<PrivacyClass, number> = {
  public_demo_safe: 0, internal_only: 1, merchant_confidential: 2,
};
export const isDemoSafe = (p: PrivacyClass) => p === 'public_demo_safe';
export const mostRestrictive = (a: PrivacyClass, b: PrivacyClass): PrivacyClass =>
  PRIVACY_RANK[a] >= PRIVACY_RANK[b] ? a : b;

export type SourceType =
  | 'onboarding' | 'web_research' | 'gmc_snapshot' | 'shopify_snapshot'
  | 'operator_decision' | 'workflow_artifact' | 'reviews' | 'community';
export type Directness = 'direct' | 'inferred' | 'derived';
export type SellableStatus = 'sellable' | 'low_stock' | 'excluded' | 'eol';
export type FreshnessStatus = 'fresh' | 'stale' | 'missing' | 'conflicted' | 'operator_locked';
export type ReviewStatus = 'auto_accepted' | 'needs_review' | 'confirmed' | 'rejected';

export interface EvidenceSource {
  merchant_id: string; source_id: string; source_type: SourceType; source_name: string;
  source_uri: string; artifact_hash: string; source_reliability: number;
  observed_at: string; ingested_at: string; created_by: string;
  privacy_class: PrivacyClass; produced_by_workflow: string | null;
  derived_from_brain_version_id: string | null; freshness_policy: string;
  status: 'pending' | 'processed' | 'failed' | 'superseded';
}

export interface Observation {
  merchant_id: string; observation_id: string; source_id: string;
  fact_key: string; observation_type: string; claim: string; structured_value: string;
  extraction_confidence: number; directness: Directness; evidence_ref: string;
  privacy_class: PrivacyClass; observed_at: string;
  extraction_method: string; review_status: ReviewStatus;
}

export interface CanonicalFact {
  merchant_id: string; fact_key: string; section: string;
  canonical_value: string; canonical_confidence: number;
  supporting_observation_ids: string[]; conflicting_observation_ids: string[];
  min_privacy: PrivacyClass; last_updated_at: string; last_brain_version_id: string;
  freshness_status: FreshnessStatus; operator_locked: boolean;
  expires_at: string | null; review_status: ReviewStatus;
}

export interface BrainVersion {
  brain_version_id: string; merchant_id: string; parent_version_id: string | null;
  trigger: 'ingest' | 'write_back' | 'operator_decision'; created_at: string;
}
export interface UpdateEvent {
  event_id: string; merchant_id: string; brain_version_id: string; source_id: string;
  observation_id: string; fact_key: string; delta: string; from_derived: boolean; created_at: string;
}
export interface OperatorDecision {
  decision_id: string; merchant_id: string; fact_key: string; chosen_value: string;
  rationale: string; locked: boolean; expires_at: string | null; decided_by: string; created_at: string;
}
export interface BundleFact {
  fact_key: string; section: string; value: string; confidence: number;
  min_privacy: PrivacyClass; freshness_status: FreshnessStatus; source_refs: string[];
}
export interface BundlePayload {
  facts: BundleFact[]; gaps: string[]; freshness_warnings: string[];
  conflicts: string[]; locked_decisions: string[]; open_questions: string[];
  topic_candidates: { topic: string; blocked: boolean; reason: string }[];
}
export interface ContextBundle {
  bundle_id: string; merchant_id: string; purpose: string; brain_version_id: string;
  generated_at: string; source_cutoff_at: string;
  payload: BundlePayload; published_payload: BundlePayload; cited_md_url: string | null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/brain/privacy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/brain/types.ts lib/brain/privacy.test.ts
git commit -m "feat(brain): core types + privacy helpers"
```

---

## Task 3: ClickHouse client + DDL + setup script

**Files:**
- Create: `lib/brain/ddl.ts`
- Create: `lib/brain/clickhouse.ts`
- Create: `scripts/setup-clickhouse.ts`

- [ ] **Step 1: Write `lib/brain/ddl.ts`**

```ts
export const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS evidence_sources (
    merchant_id String, source_id String, source_type LowCardinality(String),
    source_name String, source_uri String, artifact_hash String,
    source_reliability Float32, observed_at DateTime64(3,'UTC'),
    ingested_at DateTime64(3,'UTC'), created_by String,
    privacy_class LowCardinality(String), produced_by_workflow String,
    derived_from_brain_version_id String, freshness_policy String,
    status LowCardinality(String)
  ) ENGINE = ReplacingMergeTree(ingested_at) ORDER BY (merchant_id, source_id)`,

  `CREATE TABLE IF NOT EXISTS observations (
    merchant_id String, observation_id String, source_id String, fact_key String,
    observation_type LowCardinality(String), claim String, structured_value String,
    extraction_confidence Float32, directness LowCardinality(String), evidence_ref String,
    privacy_class LowCardinality(String), observed_at DateTime64(3,'UTC'),
    extraction_method LowCardinality(String), review_status LowCardinality(String)
  ) ENGINE = ReplacingMergeTree(observed_at) ORDER BY (merchant_id, observation_id)`,

  `CREATE TABLE IF NOT EXISTS brain_versions (
    brain_version_id String, merchant_id String, parent_version_id String,
    trigger LowCardinality(String), created_at DateTime64(3,'UTC')
  ) ENGINE = MergeTree ORDER BY (merchant_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS canonical_facts (
    merchant_id String, fact_key String, section LowCardinality(String),
    canonical_value String, canonical_confidence Float32,
    supporting_observation_ids Array(String), conflicting_observation_ids Array(String),
    min_privacy LowCardinality(String), last_updated_at DateTime64(3,'UTC'),
    last_brain_version_id String, freshness_status LowCardinality(String),
    operator_locked UInt8, expires_at Nullable(DateTime64(3,'UTC')), review_status LowCardinality(String)
  ) ENGINE = ReplacingMergeTree(last_updated_at) ORDER BY (merchant_id, fact_key)`,

  `CREATE TABLE IF NOT EXISTS update_events (
    event_id String, merchant_id String, brain_version_id String, source_id String,
    observation_id String, fact_key String, delta String, from_derived UInt8,
    created_at DateTime64(3,'UTC')
  ) ENGINE = MergeTree ORDER BY (merchant_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS operator_decisions (
    decision_id String, merchant_id String, fact_key String, chosen_value String,
    rationale String, locked UInt8, expires_at Nullable(DateTime64(3,'UTC')),
    decided_by String, created_at DateTime64(3,'UTC')
  ) ENGINE = MergeTree ORDER BY (merchant_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS context_bundles (
    bundle_id String, merchant_id String, purpose LowCardinality(String),
    brain_version_id String, generated_at DateTime64(3,'UTC'),
    source_cutoff_at DateTime64(3,'UTC'), payload String, published_payload String,
    cited_md_url String
  ) ENGINE = MergeTree ORDER BY (merchant_id, generated_at)`,
];
```

- [ ] **Step 2: Write `lib/brain/clickhouse.ts`**

```ts
import { createClient, type ClickHouseClient } from '@clickhouse/client';

let _client: ClickHouseClient | null = null;
export function ch(): ClickHouseClient {
  if (!_client) {
    _client = createClient({
      url: process.env.CLICKHOUSE_URL,
      username: process.env.CLICKHOUSE_USER ?? 'default',
      password: process.env.CLICKHOUSE_PASSWORD ?? '',
    });
  }
  return _client;
}

export async function insertRows<T>(table: string, rows: T[]): Promise<void> {
  if (rows.length === 0) return;
  await ch().insert({ table, values: rows, format: 'JSONEachRow' });
}

export async function query<T>(sql: string): Promise<T[]> {
  const rs = await ch().query({ query: sql, format: 'JSONEachRow' });
  return rs.json<T>();
}
```

- [ ] **Step 3: Write `scripts/setup-clickhouse.ts`**

```ts
import { ch } from '../lib/brain/clickhouse';
import { DDL } from '../lib/brain/ddl';

async function main() {
  for (const stmt of DDL) {
    await ch().command({ query: stmt });
    console.log('created:', stmt.split('\n')[0]);
  }
  console.log('done');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Verify against the real ClickHouse Cloud service**

Run (after filling `.env`): `npm run db:setup`
Expected: prints `created:` for all 7 tables, then `done`. If it errors with port 9440, fix `CLICKHOUSE_URL` to use `:8443`.

- [ ] **Step 5: Commit**

```bash
git add lib/brain/ddl.ts lib/brain/clickhouse.ts scripts/setup-clickhouse.ts
git commit -m "feat(brain): clickhouse client + table DDL + setup script"
```

---

## Task 4: Conflict detection (pure, TDD)

**Files:**
- Create: `lib/brain/conflict.ts`
- Test: `lib/brain/conflict.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/brain/conflict.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectConflict } from './conflict';
import type { Observation } from './types';

const obs = (id: string, value: string, directness: Observation['directness'] = 'direct'): Observation => ({
  merchant_id: 'gearit', observation_id: id, source_id: 's_' + id, fact_key: 'catalog.products.cat6_flat.sellable_status',
  observation_type: 'product_status', claim: value, structured_value: JSON.stringify({ status: value }),
  extraction_confidence: 0.9, directness, evidence_ref: 'ref', privacy_class: 'public_demo_safe',
  observed_at: '2026-06-12 10:00:00.000', extraction_method: 'llm', review_status: 'auto_accepted',
});

describe('detectConflict', () => {
  it('flags conflict when normalized values differ', () => {
    const r = detectConflict([obs('a', 'sellable'), obs('b', 'excluded')]);
    expect(r.conflicted).toBe(true);
    expect(r.conflictingObservationIds.sort()).toEqual(['a', 'b']);
  });

  it('no conflict when values agree', () => {
    const r = detectConflict([obs('a', 'sellable'), obs('b', 'sellable')]);
    expect(r.conflicted).toBe(false);
    expect(r.conflictingObservationIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/brain/conflict.test.ts`
Expected: FAIL — cannot find module `./conflict`.

- [ ] **Step 3: Write `lib/brain/conflict.ts`**

```ts
import type { Observation } from './types';

function normalized(o: Observation): string {
  try { return JSON.stringify(JSON.parse(o.structured_value)); }
  catch { return o.structured_value.trim().toLowerCase(); }
}

export interface ConflictResult {
  conflicted: boolean;
  distinctValues: string[];
  conflictingObservationIds: string[];
}

/** All observations passed in MUST share one fact_key. */
export function detectConflict(observations: Observation[]): ConflictResult {
  const byValue = new Map<string, string[]>();
  for (const o of observations) {
    const v = normalized(o);
    byValue.set(v, [...(byValue.get(v) ?? []), o.observation_id]);
  }
  const distinctValues = [...byValue.keys()];
  const conflicted = distinctValues.length > 1;
  return {
    conflicted,
    distinctValues,
    conflictingObservationIds: conflicted ? observations.map((o) => o.observation_id) : [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/brain/conflict.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/brain/conflict.ts lib/brain/conflict.test.ts
git commit -m "feat(brain): pure conflict detection"
```

---

## Task 5: Synthesis decision (pure, TDD)

Decides the new `CanonicalFact` from current state + incoming observations: applies conflict state, the **lineage guardrail** (`derived` observations can't raise confidence), `min_privacy` propagation, and `operator_locked` protection.

**Files:**
- Create: `lib/brain/synthesize.ts`
- Test: `lib/brain/synthesize.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/brain/synthesize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { synthesizeFact } from './synthesize';
import type { CanonicalFact, Observation } from './types';

const FK = 'catalog.products.cat6_flat.sellable_status';
const obs = (id: string, value: string, p: Observation['privacy_class'], d: Observation['directness'], conf = 0.9): Observation => ({
  merchant_id: 'gearit', observation_id: id, source_id: 's_' + id, fact_key: FK,
  observation_type: 'product_status', claim: value, structured_value: JSON.stringify({ status: value }),
  extraction_confidence: conf, directness: d, evidence_ref: 'ref', privacy_class: p,
  observed_at: '2026-06-12 10:00:00.000', extraction_method: 'llm', review_status: 'auto_accepted',
});

describe('synthesizeFact', () => {
  it('sets conflicted when web(sellable) meets internal(excluded), min_privacy is internal_only', () => {
    const { fact } = synthesizeFact(null, [
      obs('w', 'sellable', 'public_demo_safe', 'direct'),
      obs('i', 'excluded', 'internal_only', 'direct'),
    ], { fact_key: FK, section: 'catalog', brain_version_id: 'bv1', now: '2026-06-12 11:00:00.000' });
    expect(fact.freshness_status).toBe('conflicted');
    expect(fact.min_privacy).toBe('internal_only');
    expect(fact.conflicting_observation_ids.sort()).toEqual(['i', 'w']);
  });

  it('derived observation cannot raise confidence above current', () => {
    const current: CanonicalFact = {
      merchant_id: 'gearit', fact_key: FK, section: 'catalog', canonical_value: JSON.stringify({ status: 'sellable' }),
      canonical_confidence: 0.6, supporting_observation_ids: ['x'], conflicting_observation_ids: [],
      min_privacy: 'public_demo_safe', last_updated_at: '2026-06-12 09:00:00.000', last_brain_version_id: 'bv0',
      freshness_status: 'fresh', operator_locked: false, expires_at: null, review_status: 'auto_accepted',
    };
    const { fact } = synthesizeFact(current, [obs('d', 'sellable', 'public_demo_safe', 'derived', 0.99)],
      { fact_key: FK, section: 'catalog', brain_version_id: 'bv2', now: '2026-06-12 11:00:00.000' });
    expect(fact.canonical_confidence).toBeLessThanOrEqual(0.6);
  });

  it('operator_locked fact is not overwritten', () => {
    const locked: CanonicalFact = {
      merchant_id: 'gearit', fact_key: FK, section: 'catalog', canonical_value: JSON.stringify({ status: 'excluded' }),
      canonical_confidence: 1, supporting_observation_ids: ['op'], conflicting_observation_ids: [],
      min_privacy: 'internal_only', last_updated_at: '2026-06-12 10:30:00.000', last_brain_version_id: 'bv1',
      freshness_status: 'operator_locked', operator_locked: true, expires_at: null, review_status: 'confirmed',
    };
    const { fact, changed } = synthesizeFact(locked, [obs('w2', 'sellable', 'public_demo_safe', 'direct')],
      { fact_key: FK, section: 'catalog', brain_version_id: 'bv3', now: '2026-06-12 12:00:00.000' });
    expect(changed).toBe(false);
    expect(fact.canonical_value).toBe(JSON.stringify({ status: 'excluded' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/brain/synthesize.test.ts`
Expected: FAIL — cannot find module `./synthesize`.

- [ ] **Step 3: Write `lib/brain/synthesize.ts`**

```ts
import type { CanonicalFact, Observation } from './types';
import { mostRestrictive } from './types';
import { detectConflict } from './conflict';

export interface SynthOpts { fact_key: string; section: string; brain_version_id: string; now: string; }
export interface SynthResult { fact: CanonicalFact; changed: boolean; }

function privacyOf(obs: Observation[]): CanonicalFact['min_privacy'] {
  return obs.reduce<CanonicalFact['min_privacy']>((acc, o) => mostRestrictive(acc, o.privacy_class), 'public_demo_safe');
}

export function synthesizeFact(current: CanonicalFact | null, incoming: Observation[], opts: SynthOpts): SynthResult {
  if (current?.operator_locked) return { fact: current, changed: false };

  const all = incoming;
  const conflict = detectConflict(all);
  const min_privacy = privacyOf(all);

  // Pick winning value: highest-confidence NON-derived observation; fall back to current.
  const ranked = [...all].sort((a, b) => Number(b.directness !== 'derived') - Number(a.directness !== 'derived') || b.extraction_confidence - a.extraction_confidence);
  const winner = ranked[0];
  const nonDerivedMax = Math.max(0, ...all.filter((o) => o.directness !== 'derived').map((o) => o.extraction_confidence));

  // Lineage guardrail: derived-only evidence cannot exceed current confidence.
  const proposedConf = nonDerivedMax > 0 ? nonDerivedMax : Math.min(current?.canonical_confidence ?? 0, winner?.extraction_confidence ?? 0);

  const fact: CanonicalFact = {
    merchant_id: winner?.merchant_id ?? current!.merchant_id,
    fact_key: opts.fact_key,
    section: opts.section,
    canonical_value: conflict.conflicted ? (current?.canonical_value ?? winner.structured_value) : winner.structured_value,
    canonical_confidence: conflict.conflicted ? Math.min(current?.canonical_confidence ?? proposedConf, proposedConf) : proposedConf,
    supporting_observation_ids: conflict.conflicted ? (current?.supporting_observation_ids ?? []) : all.map((o) => o.observation_id),
    conflicting_observation_ids: conflict.conflictingObservationIds,
    min_privacy,
    last_updated_at: opts.now,
    last_brain_version_id: opts.brain_version_id,
    freshness_status: conflict.conflicted ? 'conflicted' : 'fresh',
    operator_locked: false,
    expires_at: current?.expires_at ?? null,
    review_status: conflict.conflicted ? 'needs_review' : 'auto_accepted',
  };
  const changed = !current
    || current.canonical_value !== fact.canonical_value
    || current.freshness_status !== fact.freshness_status
    || current.canonical_confidence !== fact.canonical_confidence;
  return { fact, changed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/brain/synthesize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/brain/synthesize.ts lib/brain/synthesize.test.ts
git commit -m "feat(brain): pure synthesis with conflict + lineage + privacy"
```

---

## Task 6: Bundle composition + publish-safe subset (pure, TDD)

**Files:**
- Create: `lib/brain/bundle.ts`
- Test: `lib/brain/bundle.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/brain/bundle.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { composeBlogBundle, publishSafe } from './bundle';
import type { CanonicalFact } from './types';

const fact = (fact_key: string, value: unknown, min_privacy: CanonicalFact['min_privacy'] = 'public_demo_safe', extra: Partial<CanonicalFact> = {}): CanonicalFact => ({
  merchant_id: 'gearit', fact_key, section: fact_key.split('.')[0], canonical_value: JSON.stringify(value),
  canonical_confidence: 0.9, supporting_observation_ids: ['o1'], conflicting_observation_ids: [],
  min_privacy, last_updated_at: 'now', last_brain_version_id: 'bv', freshness_status: 'fresh',
  operator_locked: false, expires_at: null, review_status: 'auto_accepted', ...extra,
});

describe('bundle', () => {
  it('blocks a topic referencing an excluded product', () => {
    const facts = [
      fact('catalog.products.cat6_flat.sellable_status', { status: 'excluded' }, 'internal_only', { operator_locked: true, freshness_status: 'operator_locked' }),
      fact('blog.topic_candidates', [{ topic: 'best flat Cat6 ethernet cables', product: 'cat6_flat' }, { topic: 'Cat6 outdoor direct-burial guide', product: 'cat6_outdoor' }]),
    ];
    const b = composeBlogBundle(facts);
    const blocked = b.topic_candidates.find((t) => t.topic.includes('flat Cat6'));
    const ok = b.topic_candidates.find((t) => t.topic.includes('direct-burial'));
    expect(blocked?.blocked).toBe(true);
    expect(ok?.blocked).toBe(false);
  });

  it('publishSafe drops non-public facts', () => {
    const b = composeBlogBundle([
      fact('identity.display_name', 'GEARit', 'public_demo_safe'),
      fact('catalog.products.cat6_flat.sellable_status', { status: 'excluded' }, 'internal_only'),
    ]);
    const pub = publishSafe(b);
    expect(pub.facts.every((f) => f.min_privacy === 'public_demo_safe')).toBe(true);
    expect(pub.facts.some((f) => f.fact_key.includes('cat6_flat'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/brain/bundle.test.ts`
Expected: FAIL — cannot find module `./bundle`.

- [ ] **Step 3: Write `lib/brain/bundle.ts`**

```ts
import type { BundleFact, BundlePayload, CanonicalFact, SellableStatus } from './types';
import { isDemoSafe } from './types';

const BLOCKED_STATUS: SellableStatus[] = ['excluded', 'eol', 'low_stock'];

function productStatus(facts: CanonicalFact[], product: string): SellableStatus | null {
  const f = facts.find((x) => x.fact_key === `catalog.products.${product}.sellable_status`);
  if (!f) return null;
  try { return JSON.parse(f.canonical_value).status as SellableStatus; } catch { return null; }
}

function toBundleFact(f: CanonicalFact): BundleFact {
  return {
    fact_key: f.fact_key, section: f.section, value: f.canonical_value, confidence: f.canonical_confidence,
    min_privacy: f.min_privacy, freshness_status: f.freshness_status, source_refs: f.supporting_observation_ids,
  };
}

export function composeBlogBundle(facts: CanonicalFact[]): BundlePayload {
  const topicsFact = facts.find((f) => f.fact_key === 'blog.topic_candidates');
  const rawTopics: { topic: string; product?: string }[] = topicsFact ? JSON.parse(topicsFact.canonical_value) : [];
  const topic_candidates = rawTopics.map((t) => {
    const status = t.product ? productStatus(facts, t.product) : null;
    const blocked = !!status && BLOCKED_STATUS.includes(status);
    return { topic: t.topic, blocked, reason: blocked ? `product ${t.product} is ${status}` : 'eligible' };
  });

  return {
    facts: facts.map(toBundleFact),
    gaps: facts.filter((f) => f.freshness_status === 'missing').map((f) => f.fact_key),
    freshness_warnings: facts.filter((f) => f.freshness_status === 'stale').map((f) => f.fact_key),
    conflicts: facts.filter((f) => f.freshness_status === 'conflicted').map((f) => f.fact_key),
    locked_decisions: facts.filter((f) => f.operator_locked).map((f) => `${f.fact_key}=${f.canonical_value}`),
    open_questions: (() => { const q = facts.find((f) => f.fact_key === 'decisions.open_questions'); return q ? JSON.parse(q.canonical_value) : []; })(),
    topic_candidates,
  };
}

export function publishSafe(payload: BundlePayload): BundlePayload {
  return {
    ...payload,
    facts: payload.facts.filter((f) => isDemoSafe(f.min_privacy)),
    locked_decisions: [], // internal by nature — never publish
    conflicts: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/brain/bundle.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/brain/bundle.ts lib/brain/bundle.test.ts
git commit -m "feat(brain): bundle composition rule + publish-safe subset"
```

---

## Task 7: GEARit fixtures (the conflict inputs)

The web side is **cached** so the demo is deterministic (risk #1). The internal fixtures are `internal_only` so they never publish (risk #2).

**Files:**
- Create: `fixtures/gearit/cached-research.json`
- Create: `fixtures/gearit/gmc-snapshot.json`
- Create: `fixtures/gearit/operator-decision.json`
- Create: `fixtures/gearit/onboarding.json`
- Create: `fixtures/gearit/writeback.json`

- [ ] **Step 1: `fixtures/gearit/cached-research.json`** (public web evidence — contains the conflicting `sellable` observation + the topic candidate)

```json
{
  "source": { "source_type": "web_research", "source_name": "gearit.com + Amazon live research", "privacy_class": "public_demo_safe", "source_reliability": 0.7 },
  "observations": [
    { "fact_key": "identity.display_name", "claim": "GEARit", "structured_value": "GEARit", "evidence_ref": "https://www.gearit.com", "directness": "direct", "confidence": 0.98 },
    { "fact_key": "catalog.products.cat6_flat.sellable_status", "claim": "Cat6 flat ethernet cable is prominently sold and in stock", "structured_value": {"status":"sellable"}, "evidence_ref": "https://www.amazon.com/GearIT-Patch-Ethernet-Density-Environment/dp/B087BJLVH7", "directness": "direct", "confidence": 0.9 },
    { "fact_key": "blog.topic_candidates", "claim": "High buyer interest in flat Cat6 cables and outdoor direct-burial", "structured_value": [{"topic":"best flat Cat6 ethernet cables","product":"cat6_flat"},{"topic":"Cat6 outdoor direct-burial buying guide","product":"cat6_outdoor"}], "evidence_ref": "https://www.amazon.com/stores/GEARit", "directness": "inferred", "confidence": 0.8 }
  ]
}
```

- [ ] **Step 2: `fixtures/gearit/gmc-snapshot.json`** (internal ground truth — excluded)

```json
{
  "source": { "source_type": "gmc_snapshot", "source_name": "GEARit GMC snapshot (sanitized)", "privacy_class": "internal_only", "source_reliability": 0.95 },
  "observations": [
    { "fact_key": "catalog.products.cat6_flat.sellable_status", "claim": "cat6_flat SKU line marked disapproved / deprioritized this quarter", "structured_value": {"status":"excluded"}, "evidence_ref": "gmc:row:cat6_flat", "directness": "direct", "confidence": 0.95 }
  ]
}
```

- [ ] **Step 3: `fixtures/gearit/operator-decision.json`** (internal — the lock rationale)

```json
{
  "source": { "source_type": "operator_decision", "source_name": "Ops decision log (sanitized)", "privacy_class": "internal_only", "source_reliability": 1.0 },
  "observations": [
    { "fact_key": "catalog.products.cat6_flat.sellable_status", "claim": "Exclude cat6_flat from content this quarter — high return rate", "structured_value": {"status":"excluded"}, "evidence_ref": "ops:2026-Q2:cat6_flat", "directness": "direct", "confidence": 1.0 }
  ]
}
```

- [ ] **Step 4: `fixtures/gearit/onboarding.json`** (public profile)

```json
{
  "source": { "source_type": "onboarding", "source_name": "GEARit onboarding profile", "privacy_class": "public_demo_safe", "source_reliability": 0.85 },
  "observations": [
    { "fact_key": "markets.primary_country", "claim": "US", "structured_value": {"country":"US"}, "evidence_ref": "onboarding:markets", "directness": "direct", "confidence": 0.9 },
    { "fact_key": "catalog.priority_categories", "claim": "Ethernet cables, speaker wire, power cords", "structured_value": ["ethernet","speaker_wire","power"], "evidence_ref": "onboarding:cats", "directness": "direct", "confidence": 0.9 }
  ]
}
```

- [ ] **Step 5: `fixtures/gearit/writeback.json`** (pre-made write-back fixture — adds proprietary claims + open question)

```json
{
  "source": { "source_type": "workflow_artifact", "source_name": "Citation-analysis artifact (pre-made)", "privacy_class": "public_demo_safe", "produced_by_workflow": "citation_analysis", "source_reliability": 0.6 },
  "observations": [
    { "fact_key": "blog.proprietary_claim_candidates", "claim": "GEARit Cat6 is pure bare copper (not CCA) — proprietary differentiator", "structured_value": ["pure bare copper conductors, not CCA"], "evidence_ref": "citation:artifact:1", "directness": "derived", "confidence": 0.7 },
    { "fact_key": "decisions.open_questions", "claim": "Confirm which outdoor SKU to feature", "structured_value": ["Which Cat6 outdoor SKU is the hero for the buying guide?"], "evidence_ref": "citation:artifact:2", "directness": "derived", "confidence": 0.7 }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add fixtures/gearit/
git commit -m "feat(brain): GEARit demo fixtures (cached web + internal conflict)"
```

---

## Task 8: Web research adapter (Anthropic web_search + cached replay)

**Files:**
- Create: `lib/brain/research/websearch.ts`
- Create: `scripts/smoke-websearch.ts`

- [ ] **Step 1: Write `lib/brain/research/websearch.ts`**

```ts
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
        `buyer topic candidates for blog content, and the brand's primary market. ` +
        `Return ONLY a JSON array of observations: ` +
        `[{"fact_key","claim","structured_value","evidence_ref"(URL),"directness","confidence"}]. ` +
        `Use fact_keys like identity.display_name, catalog.products.<sku>.sellable_status, blog.topic_candidates, markets.primary_country.`,
    }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
  const match = text.match(/\[[\s\S]*\]/);
  const observations: RawObservation[] = match ? JSON.parse(match[0]) : [];
  return { source_name: `${domain} live research`, observations };
}
```

- [ ] **Step 2: Write `scripts/smoke-websearch.ts`**

```ts
import { researchMerchant } from '../lib/brain/research/websearch';
researchMerchant('https://www.gearit.com')
  .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify cached replay works (deterministic)**

Run: `USE_CACHED_RESEARCH=1 npx tsx scripts/smoke-websearch.ts`
Expected: prints the cached observations incl. `catalog.products.cat6_flat.sellable_status` = `sellable`.

- [ ] **Step 4: Verify live research works and surfaces the SKU (risk #1 gate)**

Run: `npx tsx scripts/smoke-websearch.ts`
Expected: returns observations; **confirm** one is a `catalog.products.*` with a flat-cable product and a `blog.topic_candidates` entry. If live output differs, update the cached fixture's `evidence_ref` URLs to match reality, and rely on cached mode for the demo.

- [ ] **Step 5: Commit**

```bash
git add lib/brain/research/websearch.ts scripts/smoke-websearch.ts
git commit -m "feat(brain): anthropic web_search research adapter + cached replay"
```

---

## Task 9: Ingestion envelope (persist evidence + observations)

Turns an envelope `{ source, observations }` (from a fixture or the research adapter) into one `evidence_sources` row + N `observations` rows, inheriting privacy from the source.

**Files:**
- Create: `lib/brain/ingest.ts`
- Create: `scripts/smoke-ingest.ts`

- [ ] **Step 1: Write `lib/brain/ingest.ts`**

```ts
import { createHash, randomUUID } from 'node:crypto';
import { insertRows } from './clickhouse';
import type { EvidenceSource, Observation, PrivacyClass, SourceType } from './types';

export interface IngestEnvelope {
  source: {
    source_type: SourceType; source_name: string; privacy_class: PrivacyClass;
    source_reliability: number; source_uri?: string;
    produced_by_workflow?: string; derived_from_brain_version_id?: string;
  };
  observations: { fact_key: string; claim: string; structured_value: unknown; evidence_ref: string;
    directness: Observation['directness']; confidence: number; observation_type?: string }[];
}

const SECTION = (fk: string) => fk.split('.')[0];

export async function ingest(merchantId: string, env: IngestEnvelope, nowIso: string): Promise<{ source: EvidenceSource; observations: Observation[] }> {
  const source_id = randomUUID();
  const artifact_hash = createHash('sha256').update(JSON.stringify(env)).digest('hex');
  const source: EvidenceSource = {
    merchant_id: merchantId, source_id, source_type: env.source.source_type, source_name: env.source.source_name,
    source_uri: env.source.source_uri ?? '', artifact_hash, source_reliability: env.source.source_reliability,
    observed_at: nowIso, ingested_at: nowIso, created_by: 'agent',
    privacy_class: env.source.privacy_class, produced_by_workflow: env.source.produced_by_workflow ?? null,
    derived_from_brain_version_id: env.source.derived_from_brain_version_id ?? null,
    freshness_policy: env.source.source_type === 'web_research' ? '30d' : env.source.source_type.includes('snapshot') ? '7d' : 'never',
    status: 'processed',
  };
  const observations: Observation[] = env.observations.map((o) => ({
    merchant_id: merchantId, observation_id: randomUUID(), source_id, fact_key: o.fact_key,
    observation_type: o.observation_type ?? SECTION(o.fact_key), claim: o.claim,
    structured_value: typeof o.structured_value === 'string' ? o.structured_value : JSON.stringify(o.structured_value),
    extraction_confidence: o.confidence, directness: o.directness, evidence_ref: o.evidence_ref,
    privacy_class: env.source.privacy_class, observed_at: nowIso, extraction_method: 'fixture_or_llm',
    review_status: 'auto_accepted',
  }));
  await insertRows('evidence_sources', [source]);
  await insertRows('observations', observations);
  return { source, observations };
}
```

- [ ] **Step 2: Write `scripts/smoke-ingest.ts`**

```ts
import { readFileSync } from 'node:fs';
import { ingest } from '../lib/brain/ingest';
import { query } from '../lib/brain/clickhouse';

async function main() {
  const env = JSON.parse(readFileSync('fixtures/gearit/onboarding.json', 'utf8'));
  await ingest('gearit', { source: env.source, observations: env.observations }, '2026-06-12 10:00:00.000');
  const rows = await query<{ c: number }>(`SELECT count() AS c FROM observations WHERE merchant_id='gearit'`);
  console.log('observations for gearit:', rows[0]?.c);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify against real ClickHouse**

Run: `npx tsx scripts/smoke-ingest.ts`
Expected: prints `observations for gearit: 2` (or more on re-run).

- [ ] **Step 4: Commit**

```bash
git add lib/brain/ingest.ts scripts/smoke-ingest.ts
git commit -m "feat(brain): ingestion envelope persists evidence + observations"
```

---

## Task 10: Synthesis run (IO) — canonical + brain_versions + update_events

**Files:**
- Create: `lib/brain/synthesizeRun.ts`
- Create: `scripts/smoke-synthesize.ts`

- [ ] **Step 1: Write `lib/brain/synthesizeRun.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { insertRows, query } from './clickhouse';
import { synthesizeFact } from './synthesize';
import type { BrainVersion, CanonicalFact, Observation, UpdateEvent } from './types';

const SECTION = (fk: string) => fk.split('.')[0];

async function loadCurrent(merchantId: string): Promise<Map<string, CanonicalFact>> {
  const rows = await query<CanonicalFact & { operator_locked: number }>(
    `SELECT * FROM canonical_facts FINAL WHERE merchant_id='${merchantId}'`);
  return new Map(rows.map((r) => [r.fact_key, { ...r, operator_locked: !!r.operator_locked } as CanonicalFact]));
}

/** Recompute canonical facts for every fact_key touched by the merchant's observations. */
export async function synthesizeRun(merchantId: string, trigger: BrainVersion['trigger'], nowIso: string): Promise<{ brain_version_id: string; changedKeys: string[] }> {
  const brain_version_id = randomUUID();
  const obs = await query<Observation>(`SELECT * FROM observations WHERE merchant_id='${merchantId}'`);
  const current = await loadCurrent(merchantId);

  const byKey = new Map<string, Observation[]>();
  for (const o of obs) byKey.set(o.fact_key, [...(byKey.get(o.fact_key) ?? []), o]);

  const facts: CanonicalFact[] = [];
  const events: UpdateEvent[] = [];
  const changedKeys: string[] = [];

  for (const [fact_key, group] of byKey) {
    const cur = current.get(fact_key) ?? null;
    const { fact, changed } = synthesizeFact(cur, group, { fact_key, section: SECTION(fact_key), brain_version_id, now: nowIso });
    facts.push(fact);
    if (changed) {
      changedKeys.push(fact_key);
      events.push({
        event_id: randomUUID(), merchant_id: merchantId, brain_version_id, source_id: group[0].source_id,
        observation_id: group[0].observation_id, fact_key,
        delta: JSON.stringify({ from: cur?.canonical_value ?? null, to: fact.canonical_value, status: fact.freshness_status }),
        from_derived: group.every((g) => g.directness === 'derived'), created_at: nowIso,
      });
    }
  }

  await insertRows<BrainVersion>('brain_versions', [{ brain_version_id, merchant_id: merchantId, parent_version_id: null, trigger, created_at: nowIso }]);
  await insertRows('canonical_facts', facts.map((f) => ({ ...f, operator_locked: f.operator_locked ? 1 : 0 })));
  if (events.length) await insertRows('update_events', events.map((e) => ({ ...e, from_derived: e.from_derived ? 1 : 0 })));
  return { brain_version_id, changedKeys };
}
```

- [ ] **Step 2: Write `scripts/smoke-synthesize.ts`**

```ts
import { readFileSync } from 'node:fs';
import { ingest } from '../lib/brain/ingest';
import { synthesizeRun } from '../lib/brain/synthesizeRun';
import { query } from '../lib/brain/clickhouse';

async function main() {
  for (const f of ['onboarding', 'cached-research', 'gmc-snapshot']) {
    const env = JSON.parse(readFileSync(`fixtures/gearit/${f}.json`, 'utf8'));
    await ingest('gearit', { source: env.source, observations: env.observations }, '2026-06-12 10:00:00.000');
  }
  const r = await synthesizeRun('gearit', 'ingest', '2026-06-12 11:00:00.000');
  const facts = await query<{ fact_key: string; freshness_status: string; min_privacy: string }>(
    `SELECT fact_key, freshness_status, min_privacy FROM canonical_facts FINAL WHERE merchant_id='gearit' AND fact_key LIKE 'catalog.products%'`);
  console.log('brain version:', r.brain_version_id, 'changed:', r.changedKeys);
  console.log('cat6_flat fact:', facts);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify the conflict fires end-to-end (the demo's core)**

Run: `npx tsx scripts/smoke-synthesize.ts`
Expected: the `catalog.products.cat6_flat.sellable_status` fact prints `freshness_status: conflicted` and `min_privacy: internal_only`.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/synthesizeRun.ts scripts/smoke-synthesize.ts
git commit -m "feat(brain): synthesis run persists canonical + versions + events"
```

---

## Task 11: Operator decision (resolve + lock)

**Files:**
- Create: `lib/brain/operator.ts`
- Create: `scripts/smoke-operator.ts`

- [ ] **Step 1: Write `lib/brain/operator.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { insertRows, query } from './clickhouse';
import type { CanonicalFact, OperatorDecision } from './types';

/** Operator confirms the winning value for a conflicted fact and locks it. */
export async function resolveAndLock(merchantId: string, factKey: string, chosenValue: string, rationale: string, nowIso: string): Promise<void> {
  const decision: OperatorDecision = {
    decision_id: randomUUID(), merchant_id: merchantId, fact_key: factKey, chosen_value: chosenValue,
    rationale, locked: true, expires_at: null, decided_by: 'operator', created_at: nowIso,
  };
  await insertRows('operator_decisions', [{ ...decision, locked: 1 }]);

  const [cur] = await query<CanonicalFact & { operator_locked: number }>(
    `SELECT * FROM canonical_facts FINAL WHERE merchant_id='${merchantId}' AND fact_key='${factKey}' LIMIT 1`);
  const locked: CanonicalFact = {
    ...(cur as unknown as CanonicalFact),
    merchant_id: merchantId, fact_key: factKey, section: factKey.split('.')[0],
    canonical_value: chosenValue, canonical_confidence: 1, conflicting_observation_ids: [],
    min_privacy: cur?.min_privacy ?? 'internal_only', last_updated_at: nowIso,
    freshness_status: 'operator_locked', operator_locked: true, expires_at: null, review_status: 'confirmed',
    supporting_observation_ids: cur?.supporting_observation_ids ?? [], last_brain_version_id: cur?.last_brain_version_id ?? '',
  };
  await insertRows('canonical_facts', [{ ...locked, operator_locked: 1 }]);
}
```

- [ ] **Step 2: Write `scripts/smoke-operator.ts`**

```ts
import { resolveAndLock } from '../lib/brain/operator';
import { query } from '../lib/brain/clickhouse';

async function main() {
  await resolveAndLock('gearit', 'catalog.products.cat6_flat.sellable_status', JSON.stringify({ status: 'excluded' }), 'High return rate — exclude this quarter', '2026-06-12 11:30:00.000');
  const [f] = await query<{ freshness_status: string; operator_locked: number }>(
    `SELECT freshness_status, operator_locked FROM canonical_facts FINAL WHERE merchant_id='gearit' AND fact_key='catalog.products.cat6_flat.sellable_status'`);
  console.log('locked fact:', f);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify lock persists**

Run: `npx tsx scripts/smoke-operator.ts`
Expected: prints `{ freshness_status: 'operator_locked', operator_locked: 1 }`.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/operator.ts scripts/smoke-operator.ts
git commit -m "feat(brain): operator resolve + lock writes decision and locks fact"
```

---

## Task 12: Bundle run (IO) + context API route

**Files:**
- Create: `lib/brain/bundleRun.ts`
- Create: `app/api/brain/context/route.ts`

- [ ] **Step 1: Write `lib/brain/bundleRun.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { insertRows, query } from './clickhouse';
import { composeBlogBundle, publishSafe } from './bundle';
import type { CanonicalFact, ContextBundle } from './types';

export async function buildBlogBundle(merchantId: string, brainVersionId: string, nowIso: string): Promise<ContextBundle> {
  const rows = await query<CanonicalFact & { operator_locked: number }>(
    `SELECT * FROM canonical_facts FINAL WHERE merchant_id='${merchantId}'`);
  const facts = rows.map((r) => ({ ...r, operator_locked: !!r.operator_locked } as CanonicalFact));
  const payload = composeBlogBundle(facts);
  const published_payload = publishSafe(payload);
  const bundle: ContextBundle = {
    bundle_id: randomUUID(), merchant_id: merchantId, purpose: 'blog_source_material',
    brain_version_id: brainVersionId, generated_at: nowIso, source_cutoff_at: nowIso,
    payload, published_payload, cited_md_url: null,
  };
  await insertRows('context_bundles', [{ ...bundle, payload: JSON.stringify(payload), published_payload: JSON.stringify(published_payload) }]);
  return bundle;
}
```

- [ ] **Step 2: Write `app/api/brain/context/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { buildBlogBundle } from '@/lib/brain/bundleRun';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant') ?? 'gearit';
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const bundle = await buildBlogBundle(merchant, 'latest', now);
  return NextResponse.json(bundle);
}
```

- [ ] **Step 3: Verify the bundle blocks the bad topic**

Run: `npm run dev` then in another shell: `curl 'http://localhost:3000/api/brain/context?merchant=gearit' | npx json topic_candidates`
Expected: the "best flat Cat6" topic has `"blocked": true`; the outdoor topic has `"blocked": false`. `published_payload.facts` contains no `internal_only` facts.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/bundleRun.ts app/api/brain/context/route.ts
git commit -m "feat(brain): bundle run + context API route"
```

---

## Task 13: Senso publish to cited.md (public-safe only)

**Files:**
- Create: `lib/brain/publish/senso.ts`
- Create: `scripts/smoke-senso.ts`

- [ ] **Step 1: Write `lib/brain/publish/senso.ts`**

```ts
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
    `# GEARit — Merchant Brain Summary`,
    `## Recommended blog topics`, topics || '_none_',
    `## Cited facts`, facts || '_none_',
  ].join('\n\n');
}

/** Publish to cited.md via the Senso CLI (Node runtime only). Requires SENSO_API_KEY + SENSO_GEO_QUESTION_ID. */
export async function publishCited(b: ContextBundle): Promise<string> {
  const markdown = bundleToMarkdown(b);
  const data = JSON.stringify({
    geo_question_id: process.env.SENSO_GEO_QUESTION_ID,
    raw_markdown: markdown, seo_title: 'GEARit Merchant Brain Summary',
    summary: 'Cited, conflict-checked merchant context (public-safe).',
  });
  const { stdout } = await exec('npx', ['@senso-ai/cli', 'engine', 'publish', '--data', data, '--output', 'json', '--quiet'], {
    env: { ...process.env }, maxBuffer: 1024 * 1024,
  });
  try { return JSON.parse(stdout).url ?? stdout.trim(); } catch { return stdout.trim(); }
}
```

- [ ] **Step 2: Write `scripts/smoke-senso.ts`**

```ts
import { buildBlogBundle } from '../lib/brain/bundleRun';
import { publishCited } from '../lib/brain/publish/senso';

async function main() {
  const b = await buildBlogBundle('gearit', 'latest', '2026-06-12 12:00:00.000');
  const url = await publishCited(b);
  console.log('cited.md url:', url);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify publish (and that it contains NO internal facts)**

Run: `npx tsx scripts/smoke-senso.ts`
Expected: prints a `cited.md/...` URL. Open it and confirm there is **no** mention of the excluded `cat6_flat` status (internal_only was stripped). If the CLI needs `senso login`/`SENSO_API_KEY`, set it first; if `geo_question_id` is required, create one per the spec §7 and set `SENSO_GEO_QUESTION_ID`.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/publish/senso.ts scripts/smoke-senso.ts
git commit -m "feat(brain): senso cited.md publish of public-safe bundle"
```

---

## Task 14: Composio → Notion action

**Files:**
- Create: `lib/brain/publish/notion.ts`
- Create: `scripts/connect-notion.ts` (one-time pre-connect)
- Create: `scripts/smoke-notion.ts`

- [ ] **Step 1: Write `scripts/connect-notion.ts`** (one-time, hosted callback)

```ts
import { Composio } from '@composio/core';
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
const userId = process.env.COMPOSIO_NOTION_USER_ID ?? 'gearit_demo';
async function main() {
  const conn = await composio.connectedAccounts.link(userId, process.env.NOTION_AUTH_CONFIG_ID!);
  console.log('Open this URL to connect Notion, then re-run smoke-notion:', conn.redirectUrl);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Write `lib/brain/publish/notion.ts`**

```ts
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
  });
}
```

- [ ] **Step 3: Verify the Notion page is created**

Run: `npx tsx scripts/connect-notion.ts` (open URL, approve), then `npx tsx scripts/smoke-notion.ts` (smoke file: import + call `pushBundleToNotion(await buildBlogBundle('gearit','latest', now))`).
Expected: a Notion page titled "GEARit blog_source_material — review" appears in the connected workspace. If the slug/args error, run `npx composio generate` and adjust arg names.

- [ ] **Step 4: Commit**

```bash
git add lib/brain/publish/notion.ts scripts/connect-notion.ts scripts/smoke-notion.ts
git commit -m "feat(brain): composio notion action for operator review page"
```

---

## Task 15: Orchestrator + run/operator API routes

**Files:**
- Create: `lib/brain/orchestrator.ts`
- Create: `app/api/brain/run/route.ts`
- Create: `app/api/brain/operator/route.ts`

- [ ] **Step 1: Write `lib/brain/orchestrator.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest } from './ingest';
import { researchMerchant } from './research/websearch';
import { synthesizeRun } from './synthesizeRun';

function loadFixture(name: string) {
  const j = JSON.parse(readFileSync(join(process.cwd(), `fixtures/gearit/${name}.json`), 'utf8'));
  return { source: j.source, observations: j.observations };
}

/** Full loop: research the web + ingest ground-truth fixtures → synthesize canonical brain. */
export async function runBrain(merchantId: string, domain: string, nowIso: string) {
  const research = await researchMerchant(domain);
  await ingest(merchantId, { source: { source_type: 'web_research', source_name: research.source_name, privacy_class: 'public_demo_safe', source_reliability: 0.7 }, observations: research.observations }, nowIso);
  for (const fx of ['onboarding', 'gmc-snapshot', 'operator-decision']) {
    await ingest(merchantId, loadFixture(fx), nowIso);
  }
  return synthesizeRun(merchantId, 'ingest', nowIso);
}

/** Write-back: ingest a pre-made artifact and re-synthesize (derived → can't self-reinforce). */
export async function writeBack(merchantId: string, nowIso: string) {
  await ingest(merchantId, loadFixture('writeback'), nowIso);
  return synthesizeRun(merchantId, 'write_back', nowIso);
}
```

- [ ] **Step 2: Write `app/api/brain/run/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { runBrain, writeBack } from '@/lib/brain/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { merchant = 'gearit', domain = 'https://www.gearit.com', mode = 'run' } = await req.json().catch(() => ({}));
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const r = mode === 'writeback' ? await writeBack(merchant, now) : await runBrain(merchant, domain, now);
  return NextResponse.json(r);
}
```

- [ ] **Step 3: Write `app/api/brain/operator/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { resolveAndLock } from '@/lib/brain/operator';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { merchant = 'gearit', fact_key, chosen_value, rationale = 'operator confirmed' } = await req.json();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  await resolveAndLock(merchant, fact_key, chosen_value, rationale, now);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify the full loop via HTTP (cached, deterministic)**

Run: `npm run dev`, then:
```bash
curl -s -XPOST localhost:3000/api/brain/run -H 'content-type: application/json' -d '{"merchant":"gearit"}'
curl -s 'localhost:3000/api/brain/context?merchant=gearit' | npx json payload.conflicts
```
(Set `USE_CACHED_RESEARCH=1` in `.env.local` for deterministic runs.)
Expected: run returns a `brain_version_id`; context shows `catalog.products.cat6_flat.sellable_status` in `payload.conflicts`.

- [ ] **Step 5: Commit**

```bash
git add lib/brain/orchestrator.ts app/api/brain/run/route.ts app/api/brain/operator/route.ts
git commit -m "feat(brain): orchestrator + run/operator API routes"
```

---

## Task 16: Dashboard (the demo surface)

**Files:**
- Create: `app/brain/page.tsx`

- [ ] **Step 1: Write `app/brain/page.tsx`** (functional single-page console; refine styling iteratively)

```tsx
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
```

- [ ] **Step 2: Verify the demo beats in the browser**

Run: `npm run dev`, open `http://localhost:3000/brain`. Click buttons 1→5.
Expected: (1) activity logs research + conflict; (3) the "best flat Cat6" topic shows 🚫 blocked, outdoor shows ✅; (2) after lock it stays excluded; (4) write-back adds a 🆕 topic/question; (5) logs cited.md + Notion.

- [ ] **Step 3: Commit**

```bash
git add app/brain/page.tsx
git commit -m "feat(brain): demo dashboard (activity, bundle, conflict, diff)"
```

---

## Task 17: Publish API route (wires Senso + Notion)

**Files:**
- Create: `app/api/brain/publish/route.ts`

- [ ] **Step 1: Write `app/api/brain/publish/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { buildBlogBundle } from '@/lib/brain/bundleRun';
import { publishCited } from '@/lib/brain/publish/senso';
import { pushBundleToNotion } from '@/lib/brain/publish/notion';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { merchant = 'gearit' } = await req.json().catch(() => ({}));
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const bundle = await buildBlogBundle(merchant, 'latest', now);
  const citedUrl = await publishCited(bundle).catch((e: Error) => `error: ${e.message}`);
  const notion = await pushBundleToNotion(bundle).then(() => true).catch(() => false);
  return NextResponse.json({ citedUrl, notion });
}
```

- [ ] **Step 2: Verify end-to-end publish from the dashboard button**

Run: with `npm run dev`, click "5. Publish" on `/brain`.
Expected: activity log shows a `cited.md` URL and `Notion: created`. Open the cited.md page — confirm no `internal_only` facts appear.

- [ ] **Step 3: Commit**

```bash
git add app/api/brain/publish/route.ts
git commit -m "feat(brain): publish route wiring senso + notion"
```

---

## Task 18: Daily rerun script + Render config

**Files:**
- Create: `scripts/daily-rerun.ts`
- Create: `render.yaml`

- [ ] **Step 1: Write `scripts/daily-rerun.ts`**

```ts
import { runBrain } from '../lib/brain/orchestrator';

const i = process.argv.indexOf('--merchant');
const merchant = i >= 0 ? process.argv[i + 1] : 'gearit';

async function main() {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const r = await runBrain(merchant, 'https://www.gearit.com', now);
  console.log('daily rerun done:', merchant, r.brain_version_id, 'changed:', r.changedKeys);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Write `render.yaml`**

```yaml
envVarGroups:
  - name: brain-secrets
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: CLICKHOUSE_URL
        sync: false
      - key: CLICKHOUSE_USER
        sync: false
      - key: CLICKHOUSE_PASSWORD
        sync: false
      - key: SENSO_API_KEY
        sync: false
      - key: SENSO_GEO_QUESTION_ID
        sync: false
      - key: COMPOSIO_API_KEY
        sync: false
      - key: COMPOSIO_NOTION_USER_ID
        sync: false
      - key: NOTION_PARENT_PAGE_ID
        sync: false
services:
  - type: web
    name: merchant-brain
    runtime: node
    plan: starter
    buildCommand: npm install && npm run build
    startCommand: npm run start
    envVars:
      - fromGroup: brain-secrets
      - key: NODE_VERSION
        value: "22"
  - type: cron
    name: merchant-brain-daily
    runtime: node
    plan: starter
    schedule: "0 9 * * *"
    buildCommand: npm install
    startCommand: npm run agent:daily -- --merchant gearit
    envVars:
      - fromGroup: brain-secrets
```

- [ ] **Step 3: Verify the cron entry runs locally and exits**

Run: `USE_CACHED_RESEARCH=1 npm run agent:daily -- --merchant gearit`
Expected: prints `daily rerun done: gearit <uuid> changed: [...]` and exits 0.

- [ ] **Step 4: Deploy + commit**

Push to GitHub, create the Render Blueprint from `render.yaml`, set the `brain-secrets` group values in the dashboard. Then:
```bash
git add scripts/daily-rerun.ts render.yaml
git commit -m "feat(brain): daily cron rerun + render blueprint"
```

---

## Task 19: Golden-fixture acceptance run

Encodes the spec's acceptance: fixture pack → expected canonical facts → expected conflict → resolved decision → bundle blocks bad pick → write-back diff → public-safe publish.

**Files:**
- Create: `scripts/acceptance.ts`

- [ ] **Step 1: Write `scripts/acceptance.ts`**

```ts
import assert from 'node:assert';
import { runBrain, writeBack } from '../lib/brain/orchestrator';
import { resolveAndLock } from '../lib/brain/operator';
import { buildBlogBundle } from '../lib/brain/bundleRun';
import { publishSafe } from '../lib/brain/bundle';

const FK = 'catalog.products.cat6_flat.sellable_status';
const ts = (h: number) => `2026-06-12 ${String(h).padStart(2, '0')}:00:00.000`;

async function main() {
  process.env.USE_CACHED_RESEARCH = '1';
  await runBrain('gearit', 'https://www.gearit.com', ts(10));

  let b = await buildBlogBundle('gearit', 'latest', ts(11));
  assert(b.payload.conflicts.includes(FK), 'expected conflict on cat6_flat');
  assert(b.payload.topic_candidates.find((t) => t.topic.includes('flat Cat6'))?.blocked, 'flat-Cat6 topic must be blocked');

  await resolveAndLock('gearit', FK, JSON.stringify({ status: 'excluded' }), 'high returns', ts(12));
  b = await buildBlogBundle('gearit', 'latest', ts(13));
  assert(b.payload.locked_decisions.some((d) => d.includes('cat6_flat')), 'decision must be locked');

  const before = b.payload.topic_candidates.length + (b.payload.open_questions?.length ?? 0);
  await writeBack('gearit', ts(14));
  b = await buildBlogBundle('gearit', 'latest', ts(15));
  const after = b.payload.topic_candidates.length + (b.payload.open_questions?.length ?? 0);
  assert(after > before, 'write-back must change the bundle');

  const pub = publishSafe(b.payload);
  assert(!pub.facts.some((f) => f.fact_key === FK), 'published payload must NOT contain the internal excluded fact');

  console.log('✅ acceptance passed');
}
main().then(() => process.exit(0)).catch((e) => { console.error('❌', e.message); process.exit(1); });
```

- [ ] **Step 2: Run the acceptance gate**

Run: `npx tsx scripts/acceptance.ts`
Expected: `✅ acceptance passed`. (Run `npm run db:setup` first if tables are empty; truncate `canonical_facts`/`observations` between full runs if state accumulates: `TRUNCATE TABLE observations` etc.)

- [ ] **Step 3: Run the unit suite + commit**

```bash
npm run test
git add scripts/acceptance.ts
git commit -m "test(brain): golden-fixture acceptance run"
```

---

## Self-Review (plan author — completed)

**1. Spec coverage:** evidence/canonical layers (T2/T3/T10) · web-research source (T8) · ingestion envelope (T9) · observation extraction (T8 research + T9 normalize) · synthesis + conflict + lineage + min_privacy (T4/T5/T10) · operator resolve+lock (T11) · `blog_source_material` bundle + composition rule + publish-safe (T6/T12) · Senso cited.md (T13) · Composio Notion (T14) · orchestrator + run/writeback (T15) · dashboard with activity/conflict/bundle/diff (T16) · publish route (T17) · Render web + cron (T18) · golden-fixture acceptance (T19). **Gap noted & accepted for v0:** brain-version point-in-time canonical history is reconstruct-from-events only (spec §6 judgment call); freshness staleness (>30d/>7d) is recorded in `freshness_policy` but the staleness *transition* job is deferred (cron re-run recomputes on fresh evidence) — acceptable for a same-day demo.

**2. Placeholder scan:** every code step contains real code; no TBD/TODO. The dashboard is functional (styling is iterative, not a placeholder).

**3. Type consistency:** `synthesizeFact`, `detectConflict`, `composeBlogBundle`/`publishSafe`, `ingest`, `synthesizeRun`, `buildBlogBundle`, `resolveAndLock`, `runBrain`/`writeBack`, `publishCited`, `pushBundleToNotion` signatures are used consistently across tasks; ClickHouse boolean columns are written as `UInt8` (0/1) and read back as numbers (coerced with `!!`).
