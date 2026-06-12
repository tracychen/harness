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
    privacy_class: env.source.privacy_class, produced_by_workflow: env.source.produced_by_workflow ?? '',
    derived_from_brain_version_id: env.source.derived_from_brain_version_id ?? '',
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
