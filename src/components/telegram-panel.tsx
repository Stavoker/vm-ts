"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

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
    void load();
    const id = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(id);
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

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2 text-sm text-gray-600">
        <p>
          Пока запущен <code>npm run dev</code>, бот отвечает на{" "}
          <b>/start</b> сразу (проверка каждые 2 сек), отдельно от проверки
          сайтов.
        </p>
        <p>
          Нажми <b>/start</b> в боте — ответ должен прийти за пару секунд, без
          ожидания обновления статусов сайтов.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm text-gray-700">Добавить Chat ID вручную</span>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="например 123456789"
            className="h-9 w-full border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-gray-400"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !chatId.trim()}
          className="h-9 bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
        >
          {loading ? "Сохраняю…" : "Сохранить и отправить тест"}
        </button>
      </form>

      {status ? <p className="text-sm text-green-700">{status}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">
          Подключённые чаты ({chats.length})
        </h3>
        {chats.length === 0 ? (
          <p className="text-sm text-gray-500">Пока пусто</p>
        ) : (
          <ul className="divide-y border border-[var(--border)] bg-white">
            {chats.map((chat) => (
              <li key={chat.chat_id} className="px-3 py-2 text-sm">
                <div className="font-medium text-gray-900">
                  {chat.first_name || "Без имени"}
                  {chat.username ? (
                    <span className="text-gray-500"> @{chat.username}</span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-500">{chat.chat_id}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
