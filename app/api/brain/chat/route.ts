import { NextRequest, NextResponse } from 'next/server';
import { answerFromBrain, researchAndLearn, type Turn } from '@/lib/brain/chat';
import { assertMerchantId, resolveMerchantDomain } from '@/lib/brain/validate';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { merchant = 'gearit', message = '', mode = 'ask', history = [] } = await req.json().catch(() => ({}));
  let merchantId: string;
  try { merchantId = assertMerchantId(merchant); } catch { return NextResponse.json({ error: 'invalid input' }, { status: 400 }); }
  if (typeof message !== 'string' || !message.trim()) return NextResponse.json({ error: 'empty message' }, { status: 400 });

  const turns: Turn[] = (Array.isArray(history) ? history : [])
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
    .slice(-12)
    .map((h) => ({ role: h.role as 'user' | 'assistant', content: String(h.content).slice(0, 4000) }));

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  if (mode === 'research') {
    const domain = resolveMerchantDomain(merchantId);
    const learned = await researchAndLearn(merchantId, domain, message.slice(0, 300), now, turns);
    const ans = await answerFromBrain(merchantId, message, turns);
    return NextResponse.json({ ...ans, learned: learned.learned, researchSummary: learned.summary });
  }

  const ans = await answerFromBrain(merchantId, message, turns);
  return NextResponse.json(ans);
}
