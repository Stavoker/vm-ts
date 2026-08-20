import type { NotionPaymentItem, ReminderKind } from "@/lib/reminder-types";

const NOTION_VERSION = "2022-06-28";

type NotionRichText = { plain_text?: string };
type NotionProperty = {
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  phone_number?: string | null;
  url?: string | null;
  date?: { start?: string | null } | null;
  select?: { name?: string } | null;
};

type NotionPage = {
  id: string;
  properties?: Record<string, NotionProperty>;
};

type NotionSource = {
  databaseId: string;
  kind: ReminderKind;
};

function notionHeaders() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is missing");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function plainText(parts?: NotionRichText[]): string {
  return (parts || []).map((part) => part.plain_text || "").join("").trim();
}

function getTitle(properties: Record<string, NotionProperty>): string {
  for (const prop of Object.values(properties)) {
    if (prop.type === "title") return plainText(prop.title);
  }
  return "";
}

function getText(
  properties: Record<string, NotionProperty>,
  names: string[],
): string | null {
  for (const name of names) {
    const prop = properties[name];
    if (!prop) continue;
    if (prop.type === "rich_text") return plainText(prop.rich_text) || null;
    if (prop.type === "phone_number") return prop.phone_number || null;
    if (prop.type === "url") return prop.url || null;
    if (prop.type === "title") return plainText(prop.title) || null;
    if (prop.type === "select") return prop.select?.name || null;
  }
  return null;
}

function getDate(
  properties: Record<string, NotionProperty>,
  names: string[],
): string | null {
  for (const name of names) {
    const start = properties[name]?.date?.start;
    if (start) return start.slice(0, 10);
  }
  return null;
}

function domainFromEmails(raw: string | null): string | null {
  if (!raw) return null;
  const domains = [
    ...new Set(
      [...raw.matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/gi)].map((m) =>
        m[1].toLowerCase(),
      ),
    ),
  ];
  if (domains.length > 0) return domains.join(", ");
  return raw.replace(/\s+/g, " ").trim() || null;
}

function parseDatabaseId(value: string): string {
  return value.trim().replaceAll("-", "");
}

function parseExtraSources(raw: string | undefined): NotionSource[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [id, explicitKind] = part.split(":").map((value) => value.trim());
      const kind: ReminderKind =
        explicitKind === "phone"
          ? "phone"
          : explicitKind === "domain"
            ? "domain"
            : explicitKind === "service"
              ? "service"
              : "service";
      return { databaseId: parseDatabaseId(id), kind };
    });
}

async function queryDatabase(databaseId: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor,
        }),
      },
    );
    const data = (await response.json()) as {
      results?: NotionPage[];
      next_cursor?: string | null;
      has_more?: boolean;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(data.message || `Notion query failed (${response.status})`);
    }
    pages.push(...(data.results || []));
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

function isPageInsteadOfDatabaseError(message?: string): boolean {
  if (!message) return false;
  const text = message.toLowerCase();
  return text.includes("is a page, not a database");
}

async function findChildDatabaseId(pageId: string): Promise<string | null> {
  let cursor: string | undefined;

  do {
    const response = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100${
        cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""
      }`,
      {
        method: "GET",
        headers: notionHeaders(),
      },
    );
    const data = (await response.json()) as {
      results?: Array<{ id?: string; type?: string }>;
      next_cursor?: string | null;
      has_more?: boolean;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(data.message || `Notion block query failed (${response.status})`);
    }

    const childDb = (data.results || []).find((block) => block.type === "child_database");
    if (childDb?.id) return parseDatabaseId(childDb.id);

    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);

  return null;
}

async function querySourceDatabase(sourceId: string): Promise<NotionPage[]> {
  try {
    return await queryDatabase(sourceId);
  } catch (error) {
    if (!(error instanceof Error) || !isPageInsteadOfDatabaseError(error.message)) {
      throw error;
    }
  }

  const childDatabaseId = await findChildDatabaseId(sourceId);
  if (!childDatabaseId) {
    throw new Error(
      `Notion ID ${sourceId} is a page and does not contain a child database. Open the database itself in Notion and use its database ID.`,
    );
  }

  return queryDatabase(childDatabaseId);
}

function mapPage(
  page: NotionPage,
  kind: ReminderKind,
): NotionPaymentItem | null {
  const properties = page.properties || {};
  const dueDate = getDate(properties, [
    "Істекає",
    "Истекает",
    "Expires",
    "Оплатить до",
    "Оплатить До",
    "Оплатити до",
    "Due date",
  ]);

  const company =
    getText(properties, ["Назва компанії", "Company name", "Name"]) ||
    getTitle(properties);
  if (!company) return null;

  if (kind === "domain") {
    const emails = getText(properties, ["Email"]);
    return {
      pageId: page.id.replaceAll("-", ""),
      kind,
      company,
      target: domainFromEmails(emails),
      payFor: getText(properties, ["Price"]),
      dueDate,
    };
  }

  if (kind === "service") {
    const provider = getText(properties, [
      "Провайдер",
      "Provider",
      "Сервис",
      "Сервіс",
      "Service",
    ]);
    const safeLink = getText(properties, ["Сейф", "Safe", "Vault", "Login"]);
    const target = provider || safeLink;

    return {
      pageId: page.id.replaceAll("-", ""),
      kind,
      company,
      target,
      payFor: getText(properties, [
        "Метод оплаты",
        "Метод оплати",
        "Price",
        "Оплата",
        "Cost",
      ]),
      dueDate,
    };
  }

  return {
    pageId: page.id.replaceAll("-", ""),
    kind,
    company,
    target: getText(properties, ["Phone"]),
    payFor: getText(properties, ["Price"]),
    dueDate,
  };
}

export async function fetchNotionPayments(): Promise<NotionPaymentItem[]> {
  const phonesId = process.env.NOTION_PHONES_DATABASE_ID;
  const domainsId = process.env.NOTION_DOMAINS_DATABASE_ID;
  if (!phonesId || !domainsId) {
    throw new Error("NOTION_PHONES_DATABASE_ID / NOTION_DOMAINS_DATABASE_ID missing");
  }

  const sources: NotionSource[] = [
    { databaseId: parseDatabaseId(phonesId), kind: "phone" },
    { databaseId: parseDatabaseId(domainsId), kind: "domain" },
    ...parseExtraSources(process.env.NOTION_EXTRA_DATABASE_IDS),
  ];

  const batches = await Promise.all(
    sources.map(async (source) => ({
      source,
      pages: await querySourceDatabase(source.databaseId),
    })),
  );

  return batches
    .flatMap(({ source, pages }) => pages.map((page) => mapPage(page, source.kind)))
    .filter((item): item is NotionPaymentItem => Boolean(item));
}
