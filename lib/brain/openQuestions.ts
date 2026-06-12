// `decisions.open_questions` is the brain's self-maintained research agenda: a
// write-back action (e.g. citation analysis) raises a question, the next research
// action consumes it, answers what it can, and the agenda shrinks. This is the
// compounding loop — so the fact is a mutable latest-wins list, not a corroboration
// target (see LATEST_WINS_KEYS in synthesize.ts).

export function parseOpenQuestions(canonicalValue: string | null | undefined): string[] {
  if (!canonicalValue) return [];
  try {
    const v = JSON.parse(canonicalValue);
    return Array.isArray(v) ? v.map((q) => String(q)) : [];
  } catch {
    return [];
  }
}

/** Next agenda = (current minus what the agent resolved) plus newly surfaced questions, deduped. */
export function nextOpenQuestions(current: string[], resolved: string[], surfaced: string[]): string[] {
  const resolvedSet = new Set(resolved.map((q) => q.trim()));
  const remaining = current.filter((q) => !resolvedSet.has(q.trim()));
  const out: string[] = [];
  for (const q of [...remaining, ...surfaced]) {
    const t = q.trim();
    if (t && !out.some((x) => x.trim() === t)) out.push(t);
  }
  return out;
}
