import { NextResponse } from "next/server";
import { listPaymentReminders, runPaymentReminders } from "@/lib/reminders";

function isCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  try {
    if (isCron(request)) {
      const summary = await runPaymentReminders();
      return NextResponse.json({ ok: true, ...summary });
    }
    const reminders = await listPaymentReminders();
    return NextResponse.json({ reminders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const summary = await runPaymentReminders();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
