import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ForwarderDatabase } from "@/lib/mail-forwarder/db";

const dirs: string[] = [];

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "mail-fwd-"));
  dirs.push(dir);
  return new ForwarderDatabase(join(dir, "forwarder.db"));
}

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("ForwarderDatabase", () => {
  it("seeds mailboxes without storing env tokens", async () => {
    process.env.ZOHO_REFRESH_TOKEN = "env-token-value";
    const database = tempDb();
    const inserted = await database.seedMailboxesIfEmpty([
      {
        email: "info@playworldhub.com",
        company: "Playworldhub",
        responsible: "Vlada",
        refreshToken: "env-token-value",
        refreshTokenEnv: "ZOHO_REFRESH_TOKEN",
        enabled: true,
        accountId: null,
        zohoClientId: null,
        zohoClientSecret: null,
        zohoAccountsBaseUrl: null,
        zohoMailBaseUrl: null,
      },
    ]);
    expect(inserted).toBe(1);
    expect(await database.seedMailboxesIfEmpty([])).toBe(0);
    const mailbox = (await database.listMailboxes())[0];
    expect(mailbox.refreshToken).toBe("env-token-value");
    const view = (await database.listMailboxViews())[0];
    expect(view.tokenSource).toBe("environment");
    delete process.env.ZOHO_REFRESH_TOKEN;
  });

  it("adds, lists, and deletes a mailbox without echoing secrets", async () => {
    const database = tempDb();
    await database.addMailbox({
      email: "info@newco.test",
      company: "Newco",
      responsible: "Nick",
      enabled: true,
      refreshTokenEnv: "ZOHO_REFRESH_TOKEN",
      refreshToken: "pasted-secret-token",
      zohoClientId: "1000.NEWCLIENT",
      zohoClientSecret: "pasted-client-secret",
    });
    const views = await database.listMailboxViews();
    expect(views[0].email).toBe("info@newco.test");
    expect(views[0].tokenSource).toBe("database");
    expect(JSON.stringify(views)).not.toContain("pasted-secret-token");
    const stored = (await database.listMailboxes())[0];
    expect(stored.refreshToken).toBe("pasted-secret-token");
    await database.deleteMailbox("info@newco.test");
    expect(await database.listMailboxViews()).toEqual([]);
  });

  it("stores last poll timestamp", async () => {
    const database = tempDb();
    expect(await database.getState("last_poll_at")).toBeNull();
    await database.setState("last_poll_at", "2026-11-12T12:00:00Z");
    expect(await database.getState("last_poll_at")).toBe("2026-11-12T12:00:00Z");
  });

  it("redacts secrets when listing table rows", async () => {
    const database = tempDb();
    await database.addMailbox({
      email: "a@b.co",
      company: "Co",
      responsible: "R",
      enabled: true,
      refreshTokenEnv: "ZOHO_REFRESH_TOKEN",
      refreshToken: "secret-token",
      zohoClientSecret: "secret-client",
    });
    const { rows } = await database.listTable("mailboxes", 10, 0);
    expect(rows[0].refresh_token).toBe("[stored]");
    expect(rows[0].zoho_client_secret).toBe("[stored]");
  });
});
