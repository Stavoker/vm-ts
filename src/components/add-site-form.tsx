"use client";

import { useState, type FormEvent } from "react";

type Props = {
  onCreated: () => void;
};

export function AddSiteForm({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setDone(false);

    try {
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, notes }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Не удалось добавить сайт");
      }
      setName("");
      setUrl("");
      setNotes("");
      setDone(true);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "h-9 w-full border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-gray-400";

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm text-gray-700">Название</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My shop"
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-gray-700">URL</span>
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm text-gray-700">Заметки</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Необязательно"
          className={fieldClass}
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {done ? <p className="text-sm text-green-700">Сайт добавлен</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="h-9 bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
      >
        {loading ? "Добавляю…" : "Сохранить"}
      </button>
    </form>
  );
}
