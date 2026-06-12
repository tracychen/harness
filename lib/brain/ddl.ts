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
