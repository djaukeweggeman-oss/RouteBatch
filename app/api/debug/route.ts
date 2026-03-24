import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const usernameSet = !!process.env.ROUTEXL_USERNAME;
    const passwordSet = !!process.env.ROUTEXL_PASSWORD;
    const vercelCommit = process.env.VERCEL_GIT_COMMIT_SHA || null;
    const vercelUrl = process.env.VERCEL_URL || null;

    return NextResponse.json({
      usernameSet,
      passwordSet,
      vercelCommit,
      vercelUrl,
      note: 'Booleans only — credentials values are NOT exposed.'
    });
  } catch (e) {
    return NextResponse.json({ error: 'debug endpoint error' }, { status: 500 });
  }
}
