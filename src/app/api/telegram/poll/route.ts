import { NextResponse } from "next/server";
import { pollTelegramUpdates } from "@/lib/telegram";

let offset = 0;

/**
 * Manual/local poll for /start.
 * Does NOT delete webhook — that is only done once in instrumentation on boot.
 */
export async function POST() {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN is missing" },
        { status: 500 },
      );
    }

    const result = await pollTelegramUpdates(offset);
    offset = result.offset;

    return NextResponse.json({
      ok: true,
      activated: result.activated,
      offset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Poll failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
