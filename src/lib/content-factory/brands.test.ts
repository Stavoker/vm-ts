import { describe, expect, it } from "vitest";
import { findKnownBrand, resolveBrand } from "./brands";
import { imagePrompt } from "./openai";

describe("content factory brands", () => {
  it("matches Horizon Skill and Playworldhub to distinct identities", () => {
    const horizon = resolveBrand({
      id: "a",
      name: "Horizon Skill",
      url: "https://horizon-skill.com",
    });
    const play = resolveBrand({
      id: "b",
      name: "Playworldhub",
      url: "http://playworldhub.com",
    });
    expect(horizon.slug).toBe("horizon-skill");
    expect(play.slug).toBe("playworldhub");
    expect(horizon.palette.id).not.toBe(play.palette.id);
    expect(horizon.known).toBe(true);
    expect(findKnownBrand("PWH campaign", "https://playworldhub.com")?.slug).toBe("playworldhub");
  });

  it("synthesizes a unique fallback palette from the domain", () => {
    const one = resolveBrand({ id: "1", name: "Alpha", url: "https://alpha-one.example" });
    const two = resolveBrand({ id: "2", name: "Beta", url: "https://beta-two.example" });
    expect(one.known).toBe(false);
    expect(one.palette.id).not.toBe(two.palette.id);
  });

  it("keeps image prompts on-brand and indexed", () => {
    const brand = resolveBrand({
      id: "a",
      name: "Horizon Skill",
      url: "https://horizon-skill.com",
    });
    const prompt = imagePrompt(brand, "morning study routine", 0, 3);
    expect(prompt).toContain("Horizon Skill");
    expect(prompt).toContain("https://horizon-skill.com");
    expect(prompt).toContain("Frame 1 of 3");
    expect(prompt).toContain(brand.palette.primary);
  });
});
