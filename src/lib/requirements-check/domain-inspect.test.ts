import { describe, expect, it } from "vitest";
import { companyNameMatchesRegistrant } from "./domain-inspect";

describe("companyNameMatchesRegistrant", () => {
  it("matches when website mentions registrant org", () => {
    expect(
      companyNameMatchesRegistrant("welcome to avelnix ltd billing", {
        domain: "avelnix.net",
        registrar: "GoDaddy",
        registrantOrg: "Avelnix Ltd",
        registrantName: null,
        createdDate: "2024-01-01",
        expiryDate: null,
        nameservers: [],
      }),
    ).toBe(true);
  });
});
