import { describe, expect, it } from "vitest";
import { configurePlaywrightBrowsersPathForRuntime } from "./playwright-path-runtime";
import {
  resolvePlaywrightBrowsersPathForInstall,
  sanitizePlaywrightBrowsersPath,
} from "./playwright-path";

describe("playwright path", () => {
  it("strips duplicated env key from value", () => {
    expect(
      sanitizePlaywrightBrowsersPath(
        "PLAYWRIGHT_BROWSERS_PATH=/Users/me/project/.playwright-browsers",
      ),
    ).toBe("/Users/me/project/.playwright-browsers");
  });

  it("defaults install path to project directory", () => {
    const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    expect(resolvePlaywrightBrowsersPathForInstall()).toContain(".playwright-browsers");
    if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
  });

  it("clears invalid runtime env prefix and relative paths", () => {
    process.env.PLAYWRIGHT_BROWSERS_PATH = "PLAYWRIGHT_BROWSERS_PATH=/tmp/does-not-exist-playwright";
    configurePlaywrightBrowsersPathForRuntime();
    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBe("/tmp/does-not-exist-playwright");

    process.env.PLAYWRIGHT_BROWSERS_PATH = ".playwright-browsers";
    configurePlaywrightBrowsersPathForRuntime();
    expect(process.env.PLAYWRIGHT_BROWSERS_PATH).toBeUndefined();

    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  });
});
