export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // On Vercel serverless, intervals do not stay alive — use webhook + cron there.
  if (process.env.VERCEL) {
    console.log("[monitor] Vercel detected: use Cron + Telegram webhook");
    return;
  }

  const { CHECK_INTERVAL_MS, REMINDER_INTERVAL_MS } = await import(
    "./src/lib/constants"
  );
  const { runSiteChecks } = await import("./src/lib/check-sites");
  const { pollTelegramUpdates } = await import("./src/lib/telegram");
  const { runPaymentReminders } = await import("./src/lib/reminders");

  let checking = false;
  let telegramOffset = 0;
  let telegramBusy = false;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    try {
      // Local mode uses getUpdates; webhook must be off.
      await fetch(
        `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`,
        { method: "POST" },
      );
      console.log("[telegram] webhook cleared — polling /start every 2s");
    } catch (error) {
      console.warn("[telegram] deleteWebhook failed:", error);
    }
  }

  async function tickSites(reason: string) {
    if (checking) {
      console.log(`[monitor] skip (${reason}): already running`);
      return;
    }
    checking = true;
    try {
      console.log(`[monitor] check started (${reason})`);
      const summary = await runSiteChecks();
      console.log(
        `[monitor] done: checked=${summary.checked} changed=${summary.changed} notified=${summary.notified}`,
      );
    } catch (error) {
      console.error("[monitor] check failed:", error);
    } finally {
      checking = false;
    }
  }

  async function tickTelegram() {
    if (telegramBusy || !token) return;
    telegramBusy = true;
    try {
      const result = await pollTelegramUpdates(telegramOffset);
      telegramOffset = result.offset;
      if (result.activated > 0) {
        console.log(`[telegram] activated ${result.activated} chat(s)`);
      }
    } catch (error) {
      console.error("[telegram] poll failed:", error);
    } finally {
      telegramBusy = false;
    }
  }

  // Site checks: every 10 minutes (separate from Telegram)
  setTimeout(() => {
    void tickSites("startup");
  }, 5_000);
  setInterval(() => {
    void tickSites("interval-10m");
  }, CHECK_INTERVAL_MS);

  // /start replies immediately — do not wait for site checks
  setTimeout(() => {
    void tickTelegram();
  }, 1000);
  setInterval(() => {
    void tickTelegram();
  }, 2000);

  async function tickReminders(reason: string) {
    try {
      console.log(`[reminders] started (${reason})`);
      const summary = await runPaymentReminders();
      console.log(
        `[reminders] done: synced=${summary.synced} notified=${summary.notified}`,
      );
    } catch (error) {
      console.error("[reminders] failed:", error);
    }
  }

  setTimeout(() => {
    void tickReminders("startup");
  }, 20_000);
  setInterval(() => {
    void tickReminders("hourly");
  }, REMINDER_INTERVAL_MS);

  console.log("[monitor] auto-check enabled: every 10 minutes");
  console.log("[telegram] /start listener enabled: every 2 seconds");
  console.log("[reminders] Notion payments: hourly, 7 days before due date");
}
