import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const browsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.cwd(), ".playwright-browsers");

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
