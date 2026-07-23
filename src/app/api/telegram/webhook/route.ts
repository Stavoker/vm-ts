import { NextResponse } from "next/server";
import {
  processTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/telegram";

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (header !== secret) {
      console.warn("[telegram] webhook unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    console.log("[telegram] webhook update:", update.update_id);
    const activated = await processTelegramUpdate(update);
    return NextResponse.json({ ok: true, activated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    console.error("[telegram] webhook error:", message);
    // Always 200 for Telegram so it does not retry forever on app bugs
    return NextResponse.json({ ok: false, error: message });
  }
}
