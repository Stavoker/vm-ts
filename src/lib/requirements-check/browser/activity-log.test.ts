import { describe, expect, it, vi } from "vitest";
import {
  createBrowserActivityHooks,
  formatClickActivityMessage,
} from "@/lib/requirements-check/browser/activity-log";

describe("activity log formatting", () => {
  it("formats click and navigation messages", () => {
    expect(
      formatClickActivityMessage({
        type: "click",
        pageUrl: "https://example.com/dashboard",
        label: "Billing",
        targetKind: "button",
      }),
    ).toContain('Clicked "Billing"');

    expect(
      formatClickActivityMessage({
        type: "navigated",
        fromUrl: "https://example.com/app",
        toUrl: "https://example.com/app/billing",
        label: "Billing",
      }),
    ).toContain("Navigated via");

    expect(
      formatClickActivityMessage({
        type: "menu_item",
        pageUrl: "https://example.com/app",
        menuLabel: "Profile menu",
        itemLabel: "Top up balance",
      }),
    ).toContain("Menu item");
  });

  it("throttles scroll events to reduce server load", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const emit = vi.fn(async () => undefined);
    const setCurrent = vi.fn(async () => undefined);
    const hooks = createBrowserActivityHooks({ emit, setCurrent });

    await hooks.onScrollProgress({
      step: 1,
      maxSteps: 24,
      scrollHeight: 8000,
      scrollY: 0,
      url: "https://example.com/",
    });
    await hooks.onScrollProgress({
      step: 2,
      maxSteps: 24,
      scrollHeight: 8000,
      scrollY: 900,
      url: "https://example.com/",
    });

    expect(emit).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3_100);
    await hooks.onScrollProgress({
      step: 4,
      maxSteps: 24,
      scrollHeight: 8000,
      scrollY: 2700,
      url: "https://example.com/",
    });

    expect(emit).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
