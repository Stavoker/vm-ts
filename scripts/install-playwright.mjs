import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function sanitizePlaywrightBrowsersPath(raw) {
  let value = raw?.trim();
  if (!value) return undefined;
  if (value.startsWith("PLAYWRIGHT_BROWSERS_PATH=")) {
    value = value.slice("PLAYWRIGHT_BROWSERS_PATH=".length).trim();
  }
  if (!value) return undefined;
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

const browsersPath =
  sanitizePlaywrightBrowsersPath(process.env.PLAYWRIGHT_BROWSERS_PATH) ||
  path.join(process.cwd(), ".playwright-browsers");

fs.mkdirSync(browsersPath, { recursive: true });

const env = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: browsersPath,
};

console.log(`Installing Playwright browsers into ${browsersPath}`);

execSync("npx playwright install chromium chromium-headless-shell", {
  stdio: "inherit",
  env,
});
