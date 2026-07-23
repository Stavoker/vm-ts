import { NextResponse } from "next/server";
import { runSiteChecks } from "@/lib/check-sites";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  // Used by Vercel Cron
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runSiteChecks();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Used by the admin UI (manual checks)
  try {
    const body = (await request.json().catch(() => ({}))) as {
      siteIds?: string[];
    };
    const summary = await runSiteChecks(body.siteIds);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
