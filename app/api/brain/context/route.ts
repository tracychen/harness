import { NextRequest, NextResponse } from 'next/server';
import { buildBlogBundle } from '@/lib/brain/bundleRun';
import { assertMerchantId } from '@/lib/brain/validate';

export const runtime = 'nodejs';

// Internal operator-console endpoint: returns the FULL bundle (internal payload +
// publish-safe view) so the dashboard can show conflicts, blocked topics, and locked
// decisions. The public boundary is enforced at the publish path (publishSafe →
// cited.md / Notion), not here. Single-tenant demo: no session auth.
export async function GET(req: NextRequest) {
  let merchant: string;
  try {
    merchant = assertMerchantId(req.nextUrl.searchParams.get('merchant') ?? 'gearit');
  } catch {
    return NextResponse.json({ error: 'invalid merchant' }, { status: 400 });
  }
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const bundle = await buildBlogBundle(merchant, 'latest', now);
  return NextResponse.json(bundle);
}
