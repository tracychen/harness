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
