import { NextResponse } from "next/server";
import { ConfigError } from "@/lib/mail-forwarder/errors";
import { pollForwarderOnce } from "@/lib/mail-forwarder/runtime";

function isCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run() {
  const totals = await pollForwarderOnce();
  return NextResponse.json({ ok: true, ...totals });
}

export async function GET(request: Request) {
  try {
    if (!isCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = error instanceof ConfigError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST() {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = error instanceof ConfigError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
