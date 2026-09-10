"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Input } from "@/components/ui/primitives";
import { Pagination, usePagedList } from "@/components/ui/pagination";

type Chat = {
  chat_id: string;
  username: string | null;
  first_name: string | null;
  activated_at: string;
};

export function TelegramPanel() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/telegram/chats");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить");
      setChats(data.chats as Chat[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    const id = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      clearTimeout(timer);
      clearInterval(id);
    };
  }, [load]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/telegram/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить");
      setChatId("");
      setStatus(`Chat ${data.chat_id} сохранён. Проверь Telegram.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const { page, setPage, totalPages, slice, total } = usePagedList(chats);

  return (
    <div className="max-w-xl space-y-5">
      <Card>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Пока запущен <code>npm run dev</code>, бот отвечает на <b>/start</b> сразу (проверка каждые 2 сек), отдельно от
          проверки сайтов.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Нажми <b>/start</b> в боте — ответ должен прийти за пару секунд, без ожидания обновления статусов сайтов.
        </p>
      </Card>

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Добавить Chat ID вручную">
            <Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="например 123456789" />
          </Field>
          <Button type="submit" disabled={loading || !chatId.trim()} className="mt-4">
            {loading ? "Сохраняю…" : "Сохранить и отправить тест"}
          </Button>
        </form>
      </Card>

      {status ? <Alert tone="ok">{status}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      <Card pad={false}>
        <div className="ui-card-pad pb-2">
          <CardHeader title={`Подключённые чаты (${chats.length})`} icon={<Send size={16} />} />
        </div>
        {chats.length === 0 ? (
          <EmptyState title="Пока пусто" hint="Нажмите /start в боте или добавьте Chat ID вручную." />
        ) : (
          <ul>
            {slice.map((chat) => (
              <li key={chat.chat_id} className="border-t border-[var(--border)] px-5 py-3 text-sm">
                <div className="font-medium text-[var(--text)]">
                  {chat.first_name || "Без имени"}
                  {chat.username ? <span className="text-[var(--muted)]"> @{chat.username}</span> : null}
                </div>
                <div className="text-xs text-[var(--muted)]">{chat.chat_id}</div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
      </Card>
    </div>
  );
}
