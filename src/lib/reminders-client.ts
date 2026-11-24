export function daysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  const start = Date.parse(`${today}T00:00:00Z`);
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round((due - start) / 86_400_000);
}

export function reminderNeedsPayment(status: string, dueDate: string | null): boolean {
  if (status === "payed" || status === "later") return false;
  const left = daysUntil(dueDate);
  return left != null && left <= 7;
}

export function formatReminderPrice(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  return `€${Number(amount).toFixed(2)}`;
}
