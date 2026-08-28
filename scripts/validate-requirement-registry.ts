/**
 * Validates Requirements Registry completeness.
 * Run: npx tsx scripts/validate-requirement-registry.ts
 */
import {
  buildCoverageReportFromDefinitions,
  buildSourceCoverageReport,
  validateRegistryIntegrity,
} from "../src/lib/requirements-check/coverage";
import { REQUIREMENT_DEFINITIONS } from "../src/lib/requirements-check/registry/definitions";
import { loadRequirementDefinitions } from "../src/lib/requirements-check/registry/load-definitions";

async function main() {
  const source = buildSourceCoverageReport();
  const sourceIntegrity = validateRegistryIntegrity(
    REQUIREMENT_DEFINITIONS.map((item) => ({
      id: item.id,
      type: item.type,
      automationHandler: item.automationHandler,
      manualInstructions: item.manualInstructions,
      enabled: item.enabled,
      order: item.order,
    })),
  );

  console.log("=== Source Master Check List (extracted registry file) ===");
  console.log(`Total: ${source.total}`);
  console.log(`Mapped: ${source.mapped}`);
  console.log(`AUTOMATED: ${source.automated}`);
  console.log(`AUTHENTICATED: ${source.authenticated}`);
  console.log(`AI_REVIEW: ${source.aiReview}`);
  console.log(`EXTERNAL_DATA: ${source.externalData}`);
  console.log(`HYBRID: ${source.hybrid}`);
  console.log(`MANUAL_ONLY: ${source.manualOnly}`);
  console.log(`Unmapped: ${source.unmapped}`);
  console.log(`Duplicate IDs: ${sourceIntegrity.duplicateIds.length}`);

  try {
    const dbDefinitions = await loadRequirementDefinitions({ bypassCache: true });
    const dbCoverage = buildCoverageReportFromDefinitions(
      dbDefinitions.map((item) => ({
        id: item.id,
        type: item.type,
        automationHandler: item.automationHandler,
        enabled: item.enabled,
      })),
    );
    const dbIntegrity = validateRegistryIntegrity(
      dbDefinitions.map((item) => ({
        id: item.id,
        type: item.type,
        automationHandler: item.automationHandler,
        manualInstructions: item.manualInstructions,
        enabled: item.enabled,
        order: item.order,
      })),
    );

    console.log("\n=== Database requirement_definitions ===");
    console.log(`Total: ${dbCoverage.total}`);
    console.log(`Mapped: ${dbCoverage.mapped}`);
    console.log(`AUTOMATED: ${dbCoverage.automated}`);
    console.log(`AUTHENTICATED: ${dbCoverage.authenticated}`);
    console.log(`AI_REVIEW: ${dbCoverage.aiReview}`);
    console.log(`EXTERNAL_DATA: ${dbCoverage.externalData}`);
    console.log(`HYBRID: ${dbCoverage.hybrid}`);
    console.log(`MANUAL_ONLY: ${dbCoverage.manualOnly}`);
    console.log(`Unmapped: ${dbCoverage.unmapped}`);
    console.log(`Duplicate IDs: ${dbIntegrity.duplicateIds.length}`);

    const missingInDb = REQUIREMENT_DEFINITIONS.filter(
      (item) => !dbDefinitions.some((row) => row.id === item.id),
    ).map((item) => item.id);
    const extraInDb = dbDefinitions.filter(
      (row) => !REQUIREMENT_DEFINITIONS.some((item) => item.id === row.id),
    ).map((row) => row.id);

    console.log(`\nMissing in DB (${missingInDb.length}):`, missingInDb.slice(0, 10));
    console.log(`Extra in DB (${extraInDb.length}):`, extraInDb.slice(0, 10));

    if (source.unmapped > 0 || dbCoverage.unmapped > 0 || missingInDb.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("\nDatabase registry unavailable:", error instanceof Error ? error.message : error);
    console.error("Run supabase/requirement_definitions.sql and requirement_definitions_seed.sql");
    process.exitCode = 1;
  }
}

void main();
