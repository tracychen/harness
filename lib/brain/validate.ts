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
