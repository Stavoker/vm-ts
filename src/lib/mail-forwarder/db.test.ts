import { describe, expect, it } from "vitest";
import { ForwarderDatabase } from "@/lib/mail-forwarder/db";

const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      process.env.SUPABASE_SECRET_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()),
);

describe("ForwarderDatabase", () => {
  it.skipIf(!hasSupabase)("reads mailbox rows from the shared Supabase project", async () => {
    const database = new ForwarderDatabase();
    const views = await database.listMailboxViews();
    expect(views.length).toBeGreaterThan(0);
    expect(views.some((row) => row.email.includes("@"))).toBe(true);
    expect(JSON.stringify(views)).not.toMatch(/1000\./);
  });
});
