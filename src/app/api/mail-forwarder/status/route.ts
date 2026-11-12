import { NextResponse } from "next/server";
import { forwarderStatus, getForwarderDatabase, seedForwarderIfNeeded } from "@/lib/mail-forwarder/runtime";

export async function GET() {
  try {
    await seedForwarderIfNeeded();
    const views = await getForwarderDatabase().listMailboxViews();
    return NextResponse.json({
      ...(await forwarderStatus()),
      mailboxCount: views.length,
      enabledCount: views.filter((item) => item.enabled).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
