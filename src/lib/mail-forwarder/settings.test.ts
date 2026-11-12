import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sqlitePath } from "@/lib/mail-forwarder/settings";

const previous = process.env.SQLITE_PATH;

afterEach(() => {
  if (previous == null) delete process.env.SQLITE_PATH;
  else process.env.SQLITE_PATH = previous;
});

describe("sqlitePath", () => {
  it("uses an existing local database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "mail-fwd-path-"));
    const file = join(dir, "forwarder.db");
    writeFileSync(file, "");
    process.env.SQLITE_PATH = file;
    expect(sqlitePath()).toBe(file);
  });

  it("falls back when the configured path cannot be created on this host", () => {
    process.env.SQLITE_PATH = "/dev/null/mail-forwarder.db";
    expect(sqlitePath()).toMatch(/\.data\/mail-forwarder\.db$/);
  });
});
