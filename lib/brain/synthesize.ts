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
