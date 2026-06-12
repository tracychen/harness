import { NextRequest, NextResponse } from 'next/server';
import { answerFromBrain, researchAndLearn } from '@/lib/brain/chat';
import { assertMerchantId, resolveMerchantDomain } from '@/lib/brain/validate';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { merchant = 'gearit', message = '', mode = 'ask' } = await req.json().catch(() => ({}));
  let merchantId: string;
  try { merchantId = assertMerchantId(merchant); } catch { return NextResponse.json({ error: 'invalid input' }, { status: 400 }); }
  if (typeof message !== 'string' || !message.trim()) return NextResponse.json({ error: 'empty message' }, { status: 400 });

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  if (mode === 'research') {
    const domain = resolveMerchantDomain(merchantId);
    const learned = await researchAndLearn(merchantId, domain, message.slice(0, 300), now);
    const ans = await answerFromBrain(merchantId, message);
    return NextResponse.json({ ...ans, learned: learned.learned, researchSummary: learned.summary });
  }

  const ans = await answerFromBrain(merchantId, message);
  return NextResponse.json(ans);
}
