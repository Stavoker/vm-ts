import { describe, expect, it } from "vitest";
import { translateCountryLabel, translateDeviceLabel, translateSourceLabel } from "./pdf-i18n";

describe("pdf i18n", () => {
  it("translates common labels to Russian", () => {
    expect(translateDeviceLabel("mobile")).toBe("Мобильные");
    expect(translateCountryLabel("France")).toBe("Франция");
    expect(translateCountryLabel("Ukraine")).toBe("Украина");
    expect(translateSourceLabel("(direct) / (none)")).toBe("прямой / нет");
  });
});
