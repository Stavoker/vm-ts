import { REMINDER_DAYS_BEFORE } from "@/lib/constants";
import { fetchNotionPayments } from "@/lib/notion";
import type {
  NotionPaymentItem,
  PaymentReminder,
  ReminderStatus,
} from "@/lib/reminder-types";
import { createServerSupabase } from "@/lib/supabase";
import {
  answerTelegramCallback,
  editTelegramMessage,
  sendTelegramMessage,
  type TelegramCallbackQuery,
} from "@/lib/telegram";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = todayUtc();
  const start = Date.parse(`${today}T00:00:00Z`);
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round((due - start) / 86_400_000);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function notifiedToday(value: string | null): boolean {
  return Boolean(value && value.slice(0, 10) === todayUtc());
}

function kindLabel(kind: PaymentReminder["kind"] | NotionPaymentItem["kind"]) {
  if (kind === "domain") return "Домен";
  if (kind === "service") return "Сервис";
  return "Телефон";
}

export function buildReminderText(
  item: Pick<PaymentReminder, "company" | "target" | "pay_for" | "due_date" | "kind">,
  extra?: string,
) {
  const left = daysUntil(item.due_date);
  const when =
    left == null
      ? "дата не указана"
      : left > 0
        ? `осталось ${left} дн.`
        : left === 0
          ? "сегодня"
          : `просрочено на ${Math.abs(left)} дн.`;

  return [
    `💳 <b>Напоминание об оплате</b>`,
    ``,
    `Компания: <b>${escapeHtml(item.company)}</b>`,
    `${kindLabel(item.kind)}: <b>${escapeHtml(item.target || "—")}</b>`,
    `Оплатить: <b>${escapeHtml(item.pay_for || "—")}</b>`,
    `До: <b>${item.due_date ? formatDate(item.due_date) : "—"}</b> (${when})`,
    extra || "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buttonsFor(id: string) {
  return {
    inline_keyboard: [
      [
        { text: "Later", callback_data: `later:${id}` },
        { text: "Payed", callback_data: `payed:${id}` },
      ],
    ],
  };
}

function shouldNotify(reminder: PaymentReminder): boolean {
  if (reminder.status === "payed") return false;
  if (!reminder.due_date) return false;
  const left = daysUntil(reminder.due_date);
  if (left == null || left > REMINDER_DAYS_BEFORE) return false;
  return !notifiedToday(reminder.last_notified_at);
}

export async function listPaymentReminders(): Promise<PaymentReminder[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("payment_reminders")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data || []) as PaymentReminder[];
}

export async function setReminderStatus(
  id: string,
  status: ReminderStatus,
): Promise<PaymentReminder> {
  const supabase = createServerSupabase();
  const patch: Record<string, unknown> = { status };
  if (status === "payed") patch.payed_at = new Date().toISOString();
  if (status === "later") patch.payed_at = null;

  const { data, error } = await supabase
    .from("payment_reminders")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as PaymentReminder;
}

async function upsertFromNotion(items: NotionPaymentItem[]) {
  const supabase = createServerSupabase();
  const { data: existing, error: readError } = await supabase
    .from("payment_reminders")
    .select("notion_page_id, due_date, status");
  if (readError) throw new Error(readError.message);

  const previous = new Map(
    (existing || []).map((row) => [
      String(row.notion_page_id),
      { due_date: row.due_date as string | null, status: row.status as ReminderStatus },
    ]),
  );

  const rows = items.map((item) => {
    const prev = previous.get(item.pageId);
    const dateChanged = Boolean(prev && prev.due_date !== item.dueDate);
    return {
      notion_page_id: item.pageId,
      kind: item.kind,
      company: item.company,
      target: item.target,
      pay_for: item.payFor,
      due_date: item.dueDate,
      status: dateChanged ? ("pending" as const) : (prev?.status ?? ("pending" as const)),
      ...(dateChanged ? { last_notified_at: null, payed_at: null } : {}),
    };
  });

  const { error } = await supabase.from("payment_reminders").upsert(rows, {
    onConflict: "notion_page_id",
    ignoreDuplicates: false,
  });

  if (error) throw new Error(error.message);
}

export async function runPaymentReminders(): Promise<{
  synced: number;
  notified: number;
}> {
  const items = await fetchNotionPayments();
  await upsertFromNotion(items);

  const reminders = await listPaymentReminders();
  let notified = 0;

  const supabase = createServerSupabase();
  for (const reminder of reminders) {
    if (!shouldNotify(reminder)) continue;

    const sent = await sendTelegramMessage(buildReminderText(reminder), {
      replyMarkup: buttonsFor(reminder.id),
    });

    if (!sent) continue;

    const nextStatus: ReminderStatus =
      reminder.status === "pending" ? "pending" : reminder.status;

    await supabase
      .from("payment_reminders")
      .update({
        status: nextStatus,
        last_notified_at: new Date().toISOString(),
      })
      .eq("id", reminder.id);

    notified += 1;
  }

  return { synced: items.length, notified };
}

export async function handleReminderCallback(query: TelegramCallbackQuery) {
  const data = query.data || "";
  const [action, id] = data.split(":");
  if ((action !== "later" && action !== "payed") || !id) {
    await answerTelegramCallback(query.id);
    return;
  }

  try {
    const reminder = await setReminderStatus(
      id,
      action === "payed" ? "payed" : "later",
    );

    if (action === "later") {
      const supabase = createServerSupabase();
      await supabase
        .from("payment_reminders")
        .update({ last_notified_at: new Date().toISOString() })
        .eq("id", id);
    }

    const extra =
      action === "payed"
        ? "\n✅ Отмечено как <b>Payed</b>. Следующее напоминание — после обновления даты в Notion."
        : "\n⏳ <b>Later</b>: буду напоминать каждый день, пока не нажмёте Payed.";

    if (query.message) {
      await editTelegramMessage(
        query.message.chat.id,
        query.message.message_id,
        buildReminderText(reminder, extra),
      );
    }

    await answerTelegramCallback(
      query.id,
      action === "payed" ? "Отмечено как Payed" : "Ок, напомню завтра",
    );
  } catch (error) {
    console.error("[reminders] callback failed:", error);
    await answerTelegramCallback(query.id, "Не удалось обновить статус");
  }
}
