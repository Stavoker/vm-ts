export function daysUntil(dueDate: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const start = Date.parse(`${today}T00:00:00Z`);
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.round((due - start) / 86_400_000);
}
