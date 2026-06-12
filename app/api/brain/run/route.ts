import { NextRequest, NextResponse } from 'next/server';
import { runBrain, writeBack } from '@/lib/brain/orchestrator';
import { assertMerchantId } from '@/lib/brain/validate';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { merchant = 'gearit', domain = 'https://www.gearit.com', mode = 'run' } = await req.json().catch(() => ({}));
  let merchantId: string;
  try {
    merchantId = assertMerchantId(merchant);
  } catch {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const r = mode === 'writeback' ? await writeBack(merchantId, now) : await runBrain(merchantId, domain, now);
  return NextResponse.json(r);
}
