import { NextResponse } from "next/server";
import {
  buildCoverageReportFromDefinitions,
  buildSourceCoverageReport,
  validateRegistryIntegrity,
} from "@/lib/requirements-check/coverage";
import { startRequirementsScanJob } from "@/lib/requirements-check/engine/runner";
import { REQUIREMENT_DEFINITIONS } from "@/lib/requirements-check/registry/definitions";
import { loadRequirementDefinitions } from "@/lib/requirements-check/registry/load-definitions";
import { validatePublicWebsiteUrl } from "@/lib/requirements-check/ssrf";
import {
  createScanSession,
  listScanSessions,
} from "@/lib/requirements-check/sessions";

export async function GET() {
  try {
    const sessions = await listScanSessions(30);
    let coverage = buildSourceCoverageReport();
    let registrySource: "database" | "source_file" = "source_file";
    let definitions = null as Awaited<ReturnType<typeof loadRequirementDefinitions>> | null;

    try {
      definitions = await loadRequirementDefinitions();
      coverage = buildCoverageReportFromDefinitions(
        definitions.map((item) => ({
          id: item.id,
          type: item.type,
          automationHandler: item.automationHandler,
          enabled: item.enabled,
        })),
      );
      registrySource = "database";
    } catch {
      // DB registry not migrated yet — fall back to source extraction counts.
    }

    const integrity = validateRegistryIntegrity(
      (definitions || REQUIREMENT_DEFINITIONS).map((item) => ({
        id: item.id,
        type: item.type,
        automationHandler: item.automationHandler,
        manualInstructions: item.manualInstructions,
        enabled: item.enabled,
        order: item.order,
      })),
    );

    return NextResponse.json({ sessions, coverage, registrySource, integrity });
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
