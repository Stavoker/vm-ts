import { describe, expect, it } from "vitest";
import { normalizeHex, parsePalette, withCustomPalette } from "./palette";
import { resolveBrand } from "./brands";
import { imagePrompt } from "./openai";

describe("manual brand palette", () => {
  it("normalizes 3- and 6-digit hex", () => {
    expect(normalizeHex("#1a2")).toBe("#11AA22");
    expect(normalizeHex("0b1f3a")).toBe("#0B1F3A");
    expect(normalizeHex("nope")).toBeNull();
  });

  it("parses a complete custom palette", () => {
    const palette = parsePalette({
      primary: "#112233",
      secondary: "#445566",
      accent: "#778899",
      background: "#fff",
    });
    expect(palette).toEqual({
      id: "custom",
      primary: "#112233",
      secondary: "#445566",
      accent: "#778899",
      background: "#FFFFFF",
    });
    expect(parsePalette({ primary: "#111" })).toBeNull();
  });

  it("applies the custom palette to image prompts", () => {
    const brand = withCustomPalette(
      resolveBrand({ id: "a", name: "Horizon Skill", url: "https://horizon-skill.com" }),
      {
        id: "custom",
        primary: "#112233",
        secondary: "#445566",
        accent: "#778899",
        background: "#F5F5F5",
      },
    );
    const prompt = imagePrompt(brand, "topic", 0, 1);
    expect(prompt).toContain("#112233");
    expect(prompt).toContain("operator-set");
  });
});
