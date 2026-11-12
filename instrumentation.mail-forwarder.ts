import { MAIL_FORWARDER_INTERVAL_MS } from "./src/lib/constants";

export async function startMailForwarderLoop() {
  if (process.env.MAIL_FORWARDER_DISABLED === "true") {
    console.log("[mail-forwarder] disabled via MAIL_FORWARDER_DISABLED=true");
    return;
  }

  const { pollForwarderOnce } = await import("./src/lib/mail-forwarder/runtime");
  let busy = false;

  async function tick(reason: string) {
    if (busy) {
      console.log(`[mail-forwarder] skip (${reason}): already running`);
      return;
    }
    busy = true;
    try {
      console.log(`[mail-forwarder] poll started (${reason})`);
      const totals = await pollForwarderOnce();
      console.log("[mail-forwarder] poll done:", totals);
    } catch (error) {
      console.error("[mail-forwarder] poll failed:", error instanceof Error ? error.message : error);
    } finally {
      busy = false;
    }
  }

  const interval = Number(process.env.POLL_INTERVAL_SECONDS || "") * 1000;
  const delay = Number.isFinite(interval) && interval >= 10_000 ? interval : MAIL_FORWARDER_INTERVAL_MS;

  setTimeout(() => {
    void tick("startup");
  }, 8_000);
  setInterval(() => {
    void tick("interval-1m");
  }, delay);

  console.log(`[mail-forwarder] auto-poll enabled: every ${Math.round(delay / 1000)} seconds`);
}
