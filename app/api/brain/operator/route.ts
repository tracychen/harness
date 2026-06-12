import { NextRequest, NextResponse } from 'next/server';
import { resolveAndLock } from '@/lib/brain/operator';
import { assertFactKey, assertMerchantId } from '@/lib/brain/validate';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { merchant = 'gearit', fact_key, chosen_value, rationale = 'operator confirmed' } = await req.json();
  let merchantId: string;
  let factKey: string;
  try {
    merchantId = assertMerchantId(merchant);
    factKey = assertFactKey(fact_key);
  } catch {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  await resolveAndLock(merchantId, factKey, chosen_value, rationale, now);
  return NextResponse.json({ ok: true });
}
