"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui/primitives";

type Props = {
  onCreated: () => void;
};

export function AddSiteForm({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [ga4MeasurementId, setGa4MeasurementId] = useState("");
  const [ga4Enabled, setGa4Enabled] = useState(false);
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
        body: JSON.stringify({
          name,
          url,
          notes,
          ga4_property_id: ga4PropertyId,
          ga4_measurement_id: ga4MeasurementId,
          ga4_enabled: ga4Enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Не удалось добавить сайт");
      }
      setName("");
      setUrl("");
      setNotes("");
      setGa4PropertyId("");
      setGa4MeasurementId("");
      setGa4Enabled(false);
      setDone(true);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <Card>
        <div className="space-y-4">
          <Field label="Название">
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="My shop" />
          </Field>
          <Field label="URL">
            <Input required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          </Field>
          <Field label="Заметки">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Необязательно" />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="text-[15px] font-semibold tracking-tight">Google Analytics</div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Numeric GA4 Property ID only. Measurement ID is display-only.
        </p>
        <div className="mt-4 space-y-4">
          <Field label="GA4 Property ID">
            <Input value={ga4PropertyId} onChange={(e) => setGa4PropertyId(e.target.value)} placeholder="123456789" />
          </Field>
          <Field label="Measurement ID">
            <Input value={ga4MeasurementId} onChange={(e) => setGa4MeasurementId(e.target.value)} placeholder="G-XXXXXXXX" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input type="checkbox" checked={ga4Enabled} onChange={(e) => setGa4Enabled(e.target.checked)} />
            Enable GA4 for this site
          </label>
        </div>
      </Card>

      {error ? <Alert>{error}</Alert> : null}
      {done ? <Alert tone="ok">Сайт добавлен</Alert> : null}

      <Button type="submit" disabled={loading}>
        {loading ? "Добавляю…" : "Сохранить"}
      </Button>
    </form>
  );
}
