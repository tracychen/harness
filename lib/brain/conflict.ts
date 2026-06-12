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
