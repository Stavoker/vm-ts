import { describe, expect, it } from "vitest";
import { translateCountryLabel, translateDeviceLabel, translateSourceLabel } from "./pdf-i18n";

describe("pdf i18n", () => {
  it("translates devices, countries and source parts", () => {
    expect(translateDeviceLabel("mobile")).toBe("Мобільні");
    expect(translateCountryLabel("France")).toBe("Франція");
    expect(translateCountryLabel("Ukraine")).toBe("Україна");
    expect(translateSourceLabel("(direct) / (none)")).toBe("прямий / немає");
  });
});
