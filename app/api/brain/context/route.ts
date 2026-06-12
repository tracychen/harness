import { NextRequest, NextResponse } from 'next/server';
import { buildBlogBundle } from '@/lib/brain/bundleRun';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant') ?? 'gearit';
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const bundle = await buildBlogBundle(merchant, 'latest', now);
  return NextResponse.json(bundle);
}
