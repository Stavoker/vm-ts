import { describe, expect, it } from "vitest";
import {
  isTransientHttpFailureForTests,
  shouldNotify,
} from "@/lib/monitor";
import type { CheckResult } from "@/lib/types";

function offline(reason: string): CheckResult {
  return {
    status: "offline",
    http_status: null,
    response_time_ms: 45_000,
    status_reason: reason,
  };
}

describe("monitor", () => {
  it("treats timeout and network errors as transient", () => {
    expect(isTransientHttpFailureForTests(offline("Таймаут ответа (45 сек)"))).toBe(true);
    expect(isTransientHttpFailureForTests(offline("fetch failed"))).toBe(true);
    expect(isTransientHttpFailureForTests(offline("HTTP 403 Forbidden"))).toBe(false);
  });

  it("notifies only on online to broken transitions", () => {
    expect(shouldNotify("online", "offline")).toBe(true);
    expect(shouldNotify("offline", "offline")).toBe(false);
    expect(shouldNotify("online", "online")).toBe(false);
    expect(shouldNotify(null, "offline", { isFirstCheck: true })).toBe(true);
  });
});
