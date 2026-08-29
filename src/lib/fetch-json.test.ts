import { describe, expect, it } from "vitest";
import { readJsonResponse } from "@/lib/fetch-json";

describe("readJsonResponse", () => {
  it("parses valid JSON responses", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
    await expect(readJsonResponse<{ ok: boolean }>(response)).resolves.toEqual({ ok: true });
  });

  it("throws a readable error for HTML responses", async () => {
    const response = new Response("<!DOCTYPE html><html></html>", {
      status: 502,
      headers: { "Content-Type": "text/html" },
    });
    await expect(readJsonResponse(response)).rejects.toThrow("Server temporarily unavailable");
  });
});
