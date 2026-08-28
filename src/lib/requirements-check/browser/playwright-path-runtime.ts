/** Runtime-only Playwright path setup without fs/path.join(process.cwd()) for Next bundler tracing. */
export function configurePlaywrightBrowsersPathForRuntime(): void {
  let value = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (!value) return;

  if (value.startsWith("PLAYWRIGHT_BROWSERS_PATH=")) {
    value = value.slice("PLAYWRIGHT_BROWSERS_PATH=".length).trim();
  }

  if (!value) {
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    return;
  }

  // Bundled server code only accepts absolute paths (Render sets /opt/render/...).
  // Local dev leaves PLAYWRIGHT_BROWSERS_PATH empty and uses the default cache.
  if (!value.startsWith("/")) {
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    return;
  }

  process.env.PLAYWRIGHT_BROWSERS_PATH = value;
}
