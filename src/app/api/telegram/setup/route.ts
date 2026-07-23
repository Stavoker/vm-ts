import { NextResponse } from "next/server";

/**
 * Registers Telegram webhook for production (Vercel etc).
 * POST /api/telegram/setup
 */
export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN is missing" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    baseUrl?: string;
  };

  const baseUrl =
    body.baseUrl ||
    process.env.TELEGRAM_WEBHOOK_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!baseUrl) {
    return NextResponse.json(
      {
        error:
          "Укажи baseUrl или TELEGRAM_WEBHOOK_BASE_URL / NEXT_PUBLIC_APP_URL",
      },
      { status: 400 },
    );
  }

  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: false,
        ...(secret ? { secret_token: secret } : {}),
      }),
    },
  );

  const data = await response.json();
  return NextResponse.json({ webhookUrl, telegram: data });
}

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN is missing" },
      { status: 500 },
    );
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`,
  );
  const data = await response.json();
  return NextResponse.json(data);
}
