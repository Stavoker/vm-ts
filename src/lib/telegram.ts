import { createServerSupabase } from "@/lib/supabase";
import type { Site, SiteStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat: {
      id: number;
      username?: string;
      first_name?: string;
      type: string;
    };
  };
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export async function sendTelegramToChat(
  chatId: string | number,
  text: string,
): Promise<boolean> {
  const token = getBotToken();
  if (!token) {
    console.warn("Telegram skipped: TELEGRAM_BOT_TOKEN is missing");
    return false;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram send failed:", response.status, body);
    return false;
  }

  return true;
}

export async function saveTelegramChat(input: {
  chat_id: string;
  username?: string | null;
  first_name?: string | null;
}) {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("telegram_chats").upsert(
    {
      chat_id: String(input.chat_id),
      username: input.username || null,
      first_name: input.first_name || null,
      activated_at: new Date().toISOString(),
    },
    { onConflict: "chat_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function listChatIds(): Promise<string[]> {
  const ids = new Set<string>();

  if (process.env.TELEGRAM_CHAT_ID) {
    for (const id of process.env.TELEGRAM_CHAT_ID.split(",")) {
      const trimmed = id.trim();
      if (trimmed) ids.add(trimmed);
    }
  }

  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("telegram_chats")
      .select("chat_id");

    if (error) {
      console.warn("telegram_chats read failed:", error.message);
    } else {
      for (const row of data || []) {
        if (row.chat_id) ids.add(String(row.chat_id));
      }
    }
  } catch (error) {
    console.warn("telegram_chats unavailable:", error);
  }

  return [...ids];
}

export async function sendTelegramMessage(text: string): Promise<boolean> {
  const chatIds = await listChatIds();
  if (chatIds.length === 0) {
    console.warn(
      "Telegram skipped: no chat_id. Open the bot and press /start",
    );
    return false;
  }

  const results = await Promise.all(
    chatIds.map((chatId) => sendTelegramToChat(chatId, text)),
  );
  return results.some(Boolean);
}

export async function activateTelegramChat(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.chat?.id) return false;

  const chatId = String(message.chat.id);
  const text = (message.text || "").trim();
  const isStart = text === "/start" || text.startsWith("/start@");

  if (!isStart) return false;

  try {
    await saveTelegramChat({
      chat_id: chatId,
      username: message.chat.username,
      first_name: message.chat.first_name,
    });
  } catch (error) {
    const errText = error instanceof Error ? error.message : "DB error";
    console.error("[telegram] save failed:", errText);
    await sendTelegramToChat(
      chatId,
      [
        `⚠️ Бот получил /start, но не сохранил chat в базу.`,
        `Ошибка: <code>${escapeHtml(errText)}</code>`,
        ``,
        `Chat ID: <code>${escapeHtml(chatId)}</code>`,
        `Добавь его вручную в админке или в TELEGRAM_CHAT_ID`,
      ].join("\n"),
    );
    return false;
  }

  console.log("[telegram] chat activated:", chatId);

  const name = message.chat.first_name
    ? `, ${escapeHtml(message.chat.first_name)}`
    : "";

  await sendTelegramToChat(
    chatId,
    [
      `✅ <b>Бот активирован${name}</b>`,
      ``,
      `Теперь сюда будут приходить уведомления, если какой-то сайт перестанет работать.`,
      ``,
      `Chat ID: <code>${escapeHtml(chatId)}</code>`,
    ].join("\n"),
  );

  return true;
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  return activateTelegramChat(update);
}

export async function pollTelegramUpdates(offset: number): Promise<{
  offset: number;
  activated: number;
}> {
  const token = getBotToken();
  if (!token) return { offset, activated: 0 };

  const response = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?timeout=0&offset=${offset}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram getUpdates failed:", response.status, body);
    return { offset, activated: 0 };
  }

  const data = (await response.json()) as {
    ok: boolean;
    result?: TelegramUpdate[];
    description?: string;
  };

  if (!data.ok) {
    console.error("Telegram getUpdates error:", data.description);
    return { offset, activated: 0 };
  }

  let nextOffset = offset;
  let activated = 0;

  for (const update of data.result || []) {
    nextOffset = Math.max(nextOffset, update.update_id + 1);
    try {
      if (await processTelegramUpdate(update)) activated += 1;
    } catch (error) {
      console.error("Telegram update failed:", error);
    }
  }

  return { offset: nextOffset, activated };
}

export function buildStatusAlert(site: Site, previous: SiteStatus | null) {
  const prevLabel = previous ? STATUS_LABELS[previous] : "—";
  const nextLabel = STATUS_LABELS[site.status];
  const reason = site.status_reason
    ? `\nПричина: <b>${escapeHtml(site.status_reason)}</b>`
    : "";
  const http = site.http_status
    ? `\nHTTP: <code>${site.http_status}</code>`
    : "";

  return [
    `⚠️ <b>Vitrina Monitor</b>`,
    ``,
    `<b>${escapeHtml(site.name)}</b>`,
    `<a href="${escapeHtml(site.url)}">${escapeHtml(site.url)}</a>`,
    ``,
    `Статус: ${escapeHtml(prevLabel)} → <b>${escapeHtml(nextLabel)}</b>`,
    reason.trim(),
    http.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}
