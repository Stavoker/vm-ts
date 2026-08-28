import fs from "node:fs";
import path from "node:path";

/** Fixes copy-paste mistakes like `PLAYWRIGHT_BROWSERS_PATH=/path`. */
export function sanitizePlaywrightBrowsersPath(raw: string | undefined): string | undefined {
  let value = raw?.trim();
  if (!value) return undefined;

  if (value.startsWith("PLAYWRIGHT_BROWSERS_PATH=")) {
    value = value.slice("PLAYWRIGHT_BROWSERS_PATH=".length).trim();
  }

  if (!value) return undefined;

  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

/** Runtime: only set when explicitly configured and browsers dir exists or on Render. */
export function configurePlaywrightBrowsersPathForRuntime(): void {
  const resolved = sanitizePlaywrightBrowsersPath(process.env.PLAYWRIGHT_BROWSERS_PATH);
  if (!resolved) {
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    return;
  }

  process.env.PLAYWRIGHT_BROWSERS_PATH = resolved;

  if (!fs.existsSync(resolved)) {
    console.warn(
      `[playwright] PLAYWRIGHT_BROWSERS_PATH does not exist (${resolved}); falling back to default browser cache.`,
    );
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
}

/** Install/build: default to project-local browsers directory. */
export function resolvePlaywrightBrowsersPathForInstall(): string {
  return (
    sanitizePlaywrightBrowsersPath(process.env.PLAYWRIGHT_BROWSERS_PATH) ||
    path.join(process.cwd(), ".playwright-browsers")
  );
}
