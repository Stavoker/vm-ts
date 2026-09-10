"use client";

import { useState } from "react";
import { Alert, Button, Field, Input, Modal } from "@/components/ui/primitives";

type Props = {
  site: {
    id: string;
    ga4_property_id?: string | null;
    ga4_measurement_id?: string | null;
    ga4_enabled?: boolean;
  };
  onChanged: () => void;
};

export function Ga4SiteSettings({ site, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState(site.ga4_property_id || "");
  const [measurementId, setMeasurementId] = useState(site.ga4_measurement_id || "");
  const [enabled, setEnabled] = useState(Boolean(site.ga4_enabled));
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ga4_property_id: propertyId,
          ga4_measurement_id: measurementId,
          ga4_enabled: enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save");
      setMessage("GA4 settings saved");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const saveResponse = await fetch(`/api/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ga4_property_id: propertyId,
          ga4_measurement_id: measurementId,
          ga4_enabled: true,
        }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved.error || "Failed to save");
      setEnabled(true);
      const response = await fetch(`/api/analytics/${site.id}/test`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Test failed");
      setMessage(data.message || "GA4 connected successfully");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="relative">
      <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
        GA4
      </Button>
      {open ? (
        <Modal onClose={() => setOpen(false)}>
          <div className="text-[15px] font-semibold tracking-tight">Google Analytics</div>
          <p className="mt-1 text-xs text-[var(--muted)]">Use the numeric GA4 Property ID, not Measurement ID G-XXXX.</p>
          <div className="mt-4 space-y-3">
            <Field label="GA4 Property ID">
              <Input value={propertyId} onChange={(e) => setPropertyId(e.target.value)} placeholder="123456789" />
            </Field>
            <Field label="Measurement ID">
              <Input value={measurementId} onChange={(e) => setMeasurementId(e.target.value)} placeholder="G-XXXXXXXX" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enabled
            </label>
          </div>
          {error ? <Alert className="mt-3">{error}</Alert> : null}
          {message ? <Alert tone="ok" className="mt-3">{message}</Alert> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void testConnection()} disabled={testing || !propertyId.trim()}>
              {testing ? "Testing…" : "Test Connection"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
