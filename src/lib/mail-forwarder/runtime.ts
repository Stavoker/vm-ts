import { ForwarderDatabase } from "@/lib/mail-forwarder/db";
import { ConfigError } from "@/lib/mail-forwarder/errors";
import { Mutex } from "@/lib/mail-forwarder/mutex";
import { loadForwarderSettings, loadSeedMailboxes, sqlitePath, tryLoadForwarderSettings } from "@/lib/mail-forwarder/settings";
import type { CheckResult, ForwarderSettings, PollTotals } from "@/lib/mail-forwarder/types";
import { buildSender, MailForwarderWorker } from "@/lib/mail-forwarder/worker";

const pollLock = new Mutex();
let database: ForwarderDatabase | null = null;
let cachedPath = "";

export function getForwarderDatabase(): ForwarderDatabase {
  const path = sqlitePath();
  if (!database || cachedPath !== path) {
    database?.close();
    database = new ForwarderDatabase(path);
    cachedPath = path;
  }
  return database;
}

export async function seedForwarderIfNeeded(): Promise<number> {
  try {
    const seed = loadSeedMailboxes();
    if (!seed.length) return 0;
    return getForwarderDatabase().seedMailboxesIfEmpty(seed);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.warn("[mail-forwarder] seed skipped:", error.message);
      return 0;
    }
    throw error;
  }
}

export async function pollForwarderOnce(): Promise<PollTotals> {
  return pollLock.run(async () => {
    const loaded = tryLoadForwarderSettings();
    if (!loaded.ok) throw new ConfigError(loaded.error);
    await seedForwarderIfNeeded();
    const database = getForwarderDatabase();
    const worker = new MailForwarderWorker(loaded.settings, database, buildSender(loaded.settings));
    const totals = await worker.runOnce();
    await database.setState("last_poll_at", new Date().toISOString());
    return totals;
  });
}

export async function checkForwarder(): Promise<CheckResult> {
  const loaded = tryLoadForwarderSettings();
  if (!loaded.ok) throw new ConfigError(loaded.error);
  await seedForwarderIfNeeded();
  const worker = new MailForwarderWorker(loaded.settings, getForwarderDatabase(), buildSender(loaded.settings));
  return worker.check();
}

export async function forwarderStatus(): Promise<{
  configured: boolean;
  error?: string;
  destinationEmail?: string;
  sendMethod?: string;
  sqlitePath: string;
  pollIntervalSeconds?: number;
  lastPollAt?: string | null;
}> {
  const lastPollAt = await getForwarderDatabase().getState("last_poll_at");
  const loaded = tryLoadForwarderSettings();
  if (!loaded.ok) {
    return { configured: false, error: loaded.error, sqlitePath: sqlitePath(), lastPollAt };
  }
  return {
    configured: true,
    destinationEmail: loaded.settings.destinationEmail,
    sendMethod: loaded.settings.sendMethod,
    sqlitePath: loaded.settings.sqlitePath,
    pollIntervalSeconds: loaded.settings.pollIntervalSeconds,
    lastPollAt,
  };
}

export function requireSettings(): ForwarderSettings {
  return loadForwarderSettings();
}
