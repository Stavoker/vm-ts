import { describe, expect, it } from "vitest";
import { ForwarderDatabase } from "@/lib/mail-forwarder/db";

const hasService =
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim()) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim());

describe("ForwarderDatabase", () => {
  it.skipIf(!hasService)("reads mailbox rows from Supabase without returning tokens", async () => {
    const database = new ForwarderDatabase();
    const views = await database.listMailboxViews();
    expect(views.length).toBeGreaterThan(0);
    expect(views.some((row) => row.email.includes("@"))).toBe(true);
    expect(JSON.stringify(views)).not.toMatch(/1000\./);
  });
});
