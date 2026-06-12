import { NextRequest, NextResponse } from 'next/server';
import { buildBlogBundle } from '@/lib/brain/bundleRun';
import { publishCited } from '@/lib/brain/publish/senso';
import { pushBundleToNotion } from '@/lib/brain/publish/notion';
import { assertMerchantId } from '@/lib/brain/validate';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { merchant = 'gearit' } = await req.json().catch(() => ({}));
  let merchantId: string;
  try {
    merchantId = assertMerchantId(merchant);
  } catch {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const bundle = await buildBlogBundle(merchantId, 'latest', now);
  const citedUrl = await publishCited(bundle).catch((e: Error) => `error: ${e.message}`);
  const notion = await pushBundleToNotion(bundle).then(() => true).catch(() => false);
  return NextResponse.json({ citedUrl, notion });
}
