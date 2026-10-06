import { describe, expect, it } from "vitest";
import { reminderNeedsPayment } from "./reminders-client";

describe("reminderNeedsPayment", () => {
  it("counts pending reminders due within 7 days or overdue", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(reminderNeedsPayment("pending", today)).toBe(true);
    expect(reminderNeedsPayment("pending", "2020-01-01")).toBe(true);
    expect(reminderNeedsPayment("pending", "2099-01-01")).toBe(false);
    expect(reminderNeedsPayment("payed", today)).toBe(false);
    expect(reminderNeedsPayment("later", today)).toBe(false);
    expect(reminderNeedsPayment("pending", null)).toBe(false);
  });
});
