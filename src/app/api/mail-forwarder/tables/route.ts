import { NextResponse } from "next/server";
import { ConfigError } from "@/lib/mail-forwarder/errors";
import { getForwarderDatabase, seedForwarderIfNeeded } from "@/lib/mail-forwarder/runtime";
import { FORWARDER_TABLES, type ForwarderTableName } from "@/lib/mail-forwarder/types";

export async function GET(request: Request) {
  try {
    await seedForwarderIfNeeded();
    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "mailboxes") as ForwarderTableName;
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") || "20") || 20));
    if (!FORWARDER_TABLES.includes(name)) {
      return NextResponse.json({ error: "unknown table", tables: FORWARDER_TABLES }, { status: 400 });
    }
    const result = await getForwarderDatabase().listTable(name, pageSize, (page - 1) * pageSize);
    return NextResponse.json({
      table: name,
      tables: FORWARDER_TABLES,
      page,
      pageSize,
      total: result.total,
      rows: result.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = error instanceof ConfigError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
