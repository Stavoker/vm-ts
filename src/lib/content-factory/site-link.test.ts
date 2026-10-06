import { describe, expect, it } from "vitest";
import { resolveBrand } from "./brands";
import { imagePrompt } from "./openai";
import { canonicalSiteUrl, ctaWithSiteUrl, ensurePostContainsSiteUrl } from "./site-link";
import { composeFullPost } from "./post";

describe("site links in content factory", () => {
  it("normalizes a site URL", () => {
    expect(canonicalSiteUrl("horizon-skill.com")).toBe("https://horizon-skill.com");
    expect(canonicalSiteUrl("https://playworldhub.com/")).toBe("https://playworldhub.com");
  });

  it("puts the project URL into the CTA", () => {
    expect(ctaWithSiteUrl("Откройте Playworldhub →", "https://playworldhub.com")).toContain(
      "https://playworldhub.com",
    );
  });

  it("appends the site URL if the model omitted it", () => {
    const post = ensurePostContainsSiteUrl(
      {
        hook: "Let's go",
        body: "Details",
        disclaimer: "18+",
        cta: "Open now",
        hashtags: ["#X"],
        fullPost: composeFullPost({
          hook: "Let's go",
          body: "Details",
          disclaimer: "18+",
          cta: "Open now",
          hashtags: ["#X"],
        }),
      },
      "https://new-project.example",
    );
    expect(post.cta).toContain("https://new-project.example");
    expect(post.fullPost).toContain("https://new-project.example");
  });

  it("includes the live site URL in OpenAI image prompts for any added project", () => {
    const brand = resolveBrand({
      id: "new",
      name: "Nova Desk",
      url: "https://nova-desk.example",
    });
    const prompt = imagePrompt(brand, "launch week", 0, 2);
    expect(prompt).toContain("https://nova-desk.example");
    expect(brand.cta).toContain("https://nova-desk.example");
  });
});
