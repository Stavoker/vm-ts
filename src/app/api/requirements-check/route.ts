import { NextResponse } from "next/server";
import { buildCoverageReport } from "@/lib/requirements-check/coverage";
import { startRequirementsScanJob } from "@/lib/requirements-check/engine/runner";
import { validatePublicWebsiteUrl } from "@/lib/requirements-check/ssrf";
import {
  createScanSession,
  listScanSessions,
} from "@/lib/requirements-check/sessions";

export async function GET() {
  try {
    const sessions = await listScanSessions(30);
    const coverage = buildCoverageReport();
    return NextResponse.json({ sessions, coverage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load scans" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      websiteUrl?: string;
      login?: string;
      password?: string;
      loginPageUrl?: string;
    };

    if (!body.websiteUrl?.trim()) {
      return NextResponse.json({ error: "Website URL is required" }, { status: 400 });
    }

    const validated = validatePublicWebsiteUrl(body.websiteUrl);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    await import("@/lib/requirements-check/ssrf").then((m) =>
      m.assertResolvedTargetsArePublic(validated.hostname),
    );

    const session = await createScanSession({
      websiteUrl: validated.url,
      hostname: validated.hostname,
      credentials: {
        login: body.login?.trim() || undefined,
        password: body.password || undefined,
        loginPageUrl: body.loginPageUrl?.trim() || undefined,
      },
    });

    startRequirementsScanJob(session.id, {
      login: body.login?.trim() || undefined,
      password: body.password || undefined,
      loginPageUrl: body.loginPageUrl?.trim() || undefined,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start scan" },
      { status: 500 },
    );
  }
}
