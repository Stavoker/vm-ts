import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { saveTelegramChat, sendTelegramToChat } from "@/lib/telegram";

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("telegram_chats")
      .select("*")
      .order("activated_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      chats: data ?? [],
      envChatId: process.env.TELEGRAM_CHAT_ID || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      chat_id?: string;
      first_name?: string;
    };

    const chatId = body.chat_id?.trim();
    if (!chatId) {
      return NextResponse.json(
        { error: "chat_id обязателен" },
        { status: 400 },
      );
    }

    await saveTelegramChat({
      chat_id: chatId,
      first_name: body.first_name || null,
    });

    await sendTelegramToChat(
      chatId,
      [
        `✅ <b>Бот активирован</b>`,
        ``,
        `Chat добавлен вручную из админки.`,
        `Теперь сюда будут приходить уведомления, если сайт перестанет работать.`,
      ].join("\n"),
    );

    return NextResponse.json({ ok: true, chat_id: chatId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
