import { describe, expect, it } from "vitest";
import { composeFullPost, clampImageCount, clampPostCount, normalizeHashtag, parseGenerateRequest, planBatch } from "./post";

describe("content factory post helpers", () => {
  it("clamps image count to 1–6", () => {
    expect(clampImageCount(0)).toBe(1);
    expect(clampImageCount(3)).toBe(3);
    expect(clampImageCount(9)).toBe(6);
    expect(clampImageCount("2")).toBe(2);
    expect(clampImageCount("nope")).toBe(1);
  });

  it("plans a batch so total images stay within the OpenAI cap", () => {
    expect(clampPostCount(9)).toBe(5);
    expect(planBatch({ postCount: 3, imageCount: 2 })).toEqual({
      projectCount: 1,
      postCount: 3,
      imageCount: 2,
      totalImages: 6,
      textCalls: 1,
    });
    expect(planBatch({ postCount: 5, imageCount: 6 }).totalImages).toBeLessThanOrEqual(12);
    expect(planBatch({ projectCount: 3, postCount: 3, imageCount: 3 }).totalImages).toBeLessThanOrEqual(12);
    expect(planBatch({ projectCount: 3, postCount: 3, imageCount: 3 }).textCalls).toBe(3);
  });

  it("normalizes hashtags", () => {
    expect(normalizeHashtag("#Already")).toBe("#Already");
    expect(normalizeHashtag("  two words ")).toBe("#twowords");
    expect(normalizeHashtag("")).toBe("");
  });

  it("composes a copy-ready post with disclaimer, CTA and hashtags", () => {
    const text = composeFullPost({
      hook: "🚀 New drop",
      body: "Practice beats theory.",
      disclaimer: "Educational content.",
      cta: "Start →",
      hashtags: ["HorizonSkill", "#Learn"],
    });
    expect(text).toContain("🚀 New drop");
    expect(text).toContain("Educational content.");
    expect(text).toContain("Start →");
    expect(text).toContain("#HorizonSkill");
    expect(text).toContain("#Learn");
  });

  it("parses generate payload", () => {
    const parsed = parseGenerateRequest({
      siteId: "861fcac0-596c-4693-9920-8c1e81ceb942",
      topic: "spring campaign for new course",
      imageCount: 4,
      platform: "linkedin",
      language: "ru",
    });
    expect(parsed.imageCount).toBe(4);
    expect(parsed.postCount).toBe(1);
    expect(
      parseGenerateRequest({
        siteId: "861fcac0-596c-4693-9920-8c1e81ceb942",
        topic: "spring campaign for new course",
        postCount: 5,
        imageCount: 6,
      }).imageCount,
    ).toBe(2);
    expect(parsed.platform).toBe("linkedin");
    expect(parsed.language).toBe("ru");
    expect(parsed.siteIds).toEqual(["861fcac0-596c-4693-9920-8c1e81ceb942"]);
    expect(
      parseGenerateRequest({
        siteId: "861fcac0-596c-4693-9920-8c1e81ceb942",
        topic: "spring campaign for new course",
        palette: { primary: "#111111", secondary: "#222222", accent: "#333333", background: "#ffffff" },
      }).palette?.primary,
    ).toBe("#111111");
    const multi = parseGenerateRequest({
      siteIds: ["861fcac0-596c-4693-9920-8c1e81ceb942", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],
      topic: "spring campaign for new course",
      postCount: 2,
      imageCount: 4,
    });
    expect(multi.siteIds).toHaveLength(2);
    expect(multi.postCount * multi.imageCount * multi.siteIds.length).toBeLessThanOrEqual(12);
  });

  it("rejects a missing topic", () => {
    expect(() =>
      parseGenerateRequest({
        siteId: "861fcac0-596c-4693-9920-8c1e81ceb942",
        topic: "ab",
      }),
    ).toThrow(/тему/i);
  });
});
