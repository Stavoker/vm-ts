import { NextResponse } from "next/server";
import { ConfigError } from "@/lib/mail-forwarder/errors";
import { getForwarderDatabase, seedForwarderIfNeeded } from "@/lib/mail-forwarder/runtime";

export async function GET() {
  try {
    await seedForwarderIfNeeded();
    const mailboxes = await getForwarderDatabase().listMailboxViews();
    return NextResponse.json({ mailboxes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      company?: string;
      responsible?: string;
      enabled?: boolean;
      refreshTokenEnv?: string;
      refreshToken?: string;
      accountId?: string;
      zohoClientId?: string;
      zohoClientSecret?: string;
      zohoAccountsBaseUrl?: string;
      zohoMailBaseUrl?: string;
    };
    await getForwarderDatabase().addMailbox({
      email: body.email || "",
      company: body.company || "",
      responsible: body.responsible || "",
      enabled: Boolean(body.enabled),
      refreshTokenEnv: body.refreshTokenEnv || "ZOHO_REFRESH_TOKEN",
      refreshToken: body.refreshToken,
      accountId: body.accountId,
      zohoClientId: body.zohoClientId,
      zohoClientSecret: body.zohoClientSecret,
      zohoAccountsBaseUrl: body.zohoAccountsBaseUrl,
      zohoMailBaseUrl: body.zohoMailBaseUrl,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = error instanceof ConfigError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      company?: string;
      responsible?: string;
      enabled?: boolean;
      refreshTokenEnv?: string;
      refreshToken?: string;
      clearStoredToken?: boolean;
      accountId?: string;
      zohoClientId?: string;
      zohoClientSecret?: string;
      zohoAccountsBaseUrl?: string;
      zohoMailBaseUrl?: string;
    };
    await getForwarderDatabase().updateMailbox({
      email: body.email || "",
      company: body.company || "",
      responsible: body.responsible || "",
      enabled: Boolean(body.enabled),
      refreshTokenEnv: body.refreshTokenEnv || "ZOHO_REFRESH_TOKEN",
      refreshToken: body.refreshToken,
      clearStoredToken: body.clearStoredToken,
      accountId: body.accountId,
      zohoClientId: body.zohoClientId,
      zohoClientSecret: body.zohoClientSecret,
      zohoAccountsBaseUrl: body.zohoAccountsBaseUrl,
      zohoMailBaseUrl: body.zohoMailBaseUrl,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = error instanceof ConfigError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get("email") || "";
    if (!email.trim()) return NextResponse.json({ error: "email is required" }, { status: 400 });
    await getForwarderDatabase().deleteMailbox(email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
