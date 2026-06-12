// Boundary validators for untrusted identifiers entering the brain from HTTP routes.
// Parameterized ClickHouse queries already neutralize injection; these add a strict
// allow-list at the edge and reject malformed tenant / fact-key values early.
const MERCHANT_RE = /^[a-z0-9_-]{1,64}$/i;
const FACT_KEY_RE = /^[a-z0-9_.-]{1,128}$/i;

export function assertMerchantId(value: string): string {
  if (!MERCHANT_RE.test(value)) throw new Error(`invalid merchant id: ${JSON.stringify(value)}`);
  return value;
}

export function assertFactKey(value: string): string {
  if (!FACT_KEY_RE.test(value)) throw new Error(`invalid fact_key: ${JSON.stringify(value)}`);
  return value;
}

// Research targets are resolved from a server-side per-merchant allow-list, never
// from request input — this is the SSRF-safe alternative to accepting a `domain`
// from the client (the live web fetch happens inside Anthropic's web_search tool).
const MERCHANT_DOMAINS: Record<string, string> = {
  gearit: 'https://www.gearit.com',
};

export function resolveMerchantDomain(merchantId: string): string {
  const domain = MERCHANT_DOMAINS[merchantId];
  if (!domain) throw new Error(`no configured research domain for merchant: ${merchantId}`);
  return domain;
}
