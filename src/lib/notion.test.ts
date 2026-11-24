import { describe, expect, it } from "vitest";
import { mapNotionPaymentPage } from "./notion";

describe("mapNotionPaymentPage", () => {
  it("reads the numeric Ціна column on services without mixing it into the payment method", () => {
    const item = mapNotionPaymentPage(
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        properties: {
          Title: { type: "title", title: [{ plain_text: "Simlunea" }] },
          Провайдер: { type: "rich_text", rich_text: [{ plain_text: "servers.guru/" }] },
          Ціна: { type: "number", number: 8 },
          Метод: { type: "rich_text", rich_text: [{ plain_text: "***0620" }] },
          "Оплатити До": { type: "date", date: { start: "2026-12-11" } },
        },
      },
      "service",
    );

    expect(item).toMatchObject({
      company: "Simlunea",
      target: "servers.guru/",
      payFor: "***0620",
      price: 8,
      dueDate: "2026-12-11",
    });
  });

  it("parses euro amounts from formula or text price fields", () => {
    expect(
      mapNotionPaymentPage(
        {
          id: "11111111-2222-3333-4444-555555555555",
          properties: {
            Name: { type: "title", title: [{ plain_text: "Vitrina" }] },
            Price: { type: "formula", formula: { type: "number", number: 22.8 } },
          },
        },
        "service",
      )?.price,
    ).toBe(22.8);

    expect(
      mapNotionPaymentPage(
        {
          id: "11111111-2222-3333-4444-555555555555",
          properties: {
            Name: { type: "title", title: [{ plain_text: "Vitrina" }] },
            Цена: { type: "rich_text", rich_text: [{ plain_text: "€19.40" }] },
          },
        },
        "phone",
      )?.price,
    ).toBe(19.4);
  });
});
