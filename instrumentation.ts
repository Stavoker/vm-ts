export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.VERCEL) {
    console.log("[monitor] Vercel detected: use Cron + Telegram webhook");
    return;
  }

  if (process.env.MONITOR_DISABLED === "true") {
    console.log("[monitor] disabled via MONITOR_DISABLED=true");
    return;
  }

  if (process.env.NODE_ENV === "development" && process.env.ENABLE_LOCAL_MONITOR !== "true") {
    console.log(
      "[monitor] local dev: auto-check disabled (set ENABLE_LOCAL_MONITOR=true to enable)",
    );
    return;
  }

  const { startNodeInstrumentation } = await import("./instrumentation.node");
  await startNodeInstrumentation();
}
