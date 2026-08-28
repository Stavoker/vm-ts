import { describe, expect, it } from "vitest";
import { formatClickActivityMessage } from "@/lib/requirements-check/browser/activity-log";

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
});
