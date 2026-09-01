import { describe, expect, it } from "vitest";
import type { ScanContext } from "../types";
import { checkDedicatedPolicyPage, pageMatchesDedicatedPolicy } from "./shared";

function context(
  pages: ScanContext["pages"],
  snapshots: Map<string, { html: string; visibleText: string; title?: string }>,
): ScanContext {
  return {
    sessionId: "s1",
    websiteUrl: "https://avelnix.net",
    hostname: "avelnix.net",
    pages,
    results: new Map(),
    pageSnapshots: snapshots as ScanContext["pageSnapshots"],
    emit: async () => {},
    setCurrent: async () => {},
    saveScreenshot: async () => null,
    isCancelled: () => false,
    isPaused: () => false,
    waitIfPaused: async () => {},
  };
}

const refundConfig = {
  urlPathPattern: /\/(?:refund|returns|return-policy|refund-policy|money-back)(?:\/|$|-)/i,
  headingPattern: /\b(refund\s+policy|return\s+policy|returns\s+policy|money[- ]back\s+policy)\b/i,
};

const deliveryConfig = {
  urlPathPattern: /\/(?:delivery|shipping|dispatch|fulfillment)(?:\/|$|-)/i,
  headingPattern: /\b(delivery\s+policy|shipping\s+policy|dispatch\s+policy|fulfillment\s+policy)\b/i,
};

describe("dedicated legal policy checks", () => {
  it("does not pass generic terms page when only refund is mentioned in body", async () => {
    const url = "https://avelnix.net/legal/terms-and-conditions";
    const pages = [{ url, pageType: "legal", httpStatus: 200, checked: true, title: "Terms" }];
    const snapshots = new Map([
      [
        url,
        {
          title: "Terms and Conditions",
          visibleText: Array(90).fill("refund").join(" "),
          html: "<h1>Terms and Conditions</h1><p>General terms without a dedicated refund policy section.</p>",
        },
      ],
    ]);

    const result = await checkDedicatedPolicyPage(
      {
        id: "refund_policy_page",
        displayName: "Refund Policy page.",
        automationHandler: "legalPageChecker",
      } as never,
      context(pages, snapshots),
      refundConfig,
    );

    expect(result.status).toBe("FAIL");
    expect(result.explanation).toContain("Generic terms/privacy");
  });

  it("passes dedicated refund policy URL with enough content", async () => {
    const url = "https://avelnix.net/legal/refund-policy";
    const pages = [{ url, pageType: "legal", httpStatus: 200, checked: true, title: "Refund" }];
    const snapshots = new Map([
      [
        url,
        {
          title: "Refund Policy",
          visibleText: Array(90).fill("policy").join(" "),
          html: "<h1>Refund Policy</h1>",
        },
      ],
    ]);

    const match = pageMatchesDedicatedPolicy(pages[0]!, context(pages, snapshots), refundConfig);
    expect(match.matched).toBe(true);

    const result = await checkDedicatedPolicyPage(
      {
        id: "refund_policy_page",
        displayName: "Refund Policy page.",
        automationHandler: "legalPageChecker",
      } as never,
      context(pages, snapshots),
      refundConfig,
    );
    expect(result.status).toBe("PASS");
    expect(result.checkedUrl).toBe(url);
  });

  it("does not pass delivery policy from terms page with incidental shipping mention", async () => {
    const url = "https://avelnix.net/legal/terms-and-conditions";
    const pages = [{ url, pageType: "legal", httpStatus: 200, checked: true, title: "Terms" }];
    const snapshots = new Map([
      [
        url,
        {
          title: "Terms and Conditions",
          visibleText: `${Array(85).fill("word").join(" ")} shipping logistics partner`,
          html: "<h1>Terms and Conditions</h1>",
        },
      ],
    ]);

    const result = await checkDedicatedPolicyPage(
      {
        id: "delivery_policy_page",
        displayName: "Delivery Policy page.",
        automationHandler: "legalPageChecker",
      } as never,
      context(pages, snapshots),
      deliveryConfig,
    );

    expect(result.status).toBe("FAIL");
  });

  it("passes when page has a dedicated delivery policy heading", async () => {
    const url = "https://avelnix.net/legal/terms-and-conditions";
    const pages = [{ url, pageType: "legal", httpStatus: 200, checked: true, title: "Legal" }];
    const snapshots = new Map([
      [
        url,
        {
          title: "Legal",
          visibleText: Array(90).fill("delivery").join(" "),
          html: "<h1>Terms</h1><h2>Delivery Policy</h2><p>Digital service delivery details.</p>",
        },
      ],
    ]);

    const result = await checkDedicatedPolicyPage(
      {
        id: "delivery_policy_page",
        displayName: "Delivery Policy page.",
        automationHandler: "legalPageChecker",
      } as never,
      context(pages, snapshots),
      deliveryConfig,
    );

    expect(result.status).toBe("PASS");
  });
});
