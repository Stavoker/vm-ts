/**
 * Generates supabase/requirement_definitions_seed.sql from the Master Check List registry.
 * Run: npx tsx scripts/generate-requirement-definitions-seed.ts
 */
import fs from "node:fs";
import path from "node:path";
import { REQUIREMENT_DEFINITIONS } from "../src/lib/requirements-check/registry/definitions";

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlJson(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

const lines: string[] = [
  "-- Auto-generated seed for requirement_definitions (safe to re-run)",
  "-- Source: Master_check_list_for_Website_creation_and_company_onboarding",
  "",
];

for (const item of REQUIREMENT_DEFINITIONS) {
  const config = {
    mandatoryLevel: item.mandatoryLevel,
  };

  lines.push(`insert into public.requirement_definitions (`);
  lines.push(
    `  id, original_name, display_name, original_description, category, sub_category,`,
  );
  lines.push(
    `  requirement_type, weight, severity, enabled, sort_order, handler_key,`,
  );
  lines.push(
    `  manual_instructions, evidence_requirements, config, source_reference, source_section, source_row`,
  );
  lines.push(`) values (`);
  lines.push(`  ${sqlString(item.id)},`);
  lines.push(`  ${sqlString(item.originalName)},`);
  lines.push(`  ${sqlString(item.displayName)},`);
  lines.push(`  ${sqlString(item.originalDescription || "")},`);
  lines.push(`  ${sqlString(item.category)},`);
  lines.push(`  ${sqlString(item.subCategory || "")},`);
  lines.push(`  ${sqlString(item.type)}::public.requirement_definition_type,`);
  lines.push(`  ${item.weight},`);
  lines.push(`  ${sqlString(item.severity)},`);
  lines.push(`  ${item.enabled},`);
  lines.push(`  ${item.order},`);
  lines.push(`  ${sqlString(item.automationHandler)},`);
  lines.push(`  ${sqlString(item.manualInstructions || "")},`);
  lines.push(`  ${sqlJson(item.evidenceRequirements || [])},`);
  lines.push(`  ${sqlJson(config)},`);
  lines.push(`  ${sqlString(item.sourceReference)},`);
  lines.push(`  ${sqlString(item.sourceSection || "")},`);
  lines.push(`  ${item.originalOrder}`);
  lines.push(`) on conflict (id) do update set`);
  lines.push(`  original_name = excluded.original_name,`);
  lines.push(`  display_name = excluded.display_name,`);
  lines.push(`  original_description = excluded.original_description,`);
  lines.push(`  category = excluded.category,`);
  lines.push(`  sub_category = excluded.sub_category,`);
  lines.push(`  requirement_type = excluded.requirement_type,`);
  lines.push(`  weight = excluded.weight,`);
  lines.push(`  severity = excluded.severity,`);
  lines.push(`  enabled = excluded.enabled,`);
  lines.push(`  sort_order = excluded.sort_order,`);
  lines.push(`  handler_key = excluded.handler_key,`);
  lines.push(`  manual_instructions = excluded.manual_instructions,`);
  lines.push(`  evidence_requirements = excluded.evidence_requirements,`);
  lines.push(`  config = excluded.config,`);
  lines.push(`  source_reference = excluded.source_reference,`);
  lines.push(`  source_section = excluded.source_section,`);
  lines.push(`  source_row = excluded.source_row,`);
  lines.push(`  updated_at = now();`);
  lines.push("");
}

lines.push(`-- Backfill orphan historical result IDs before FK`);
lines.push(`insert into public.requirement_definitions (`);
lines.push(`  id, original_name, display_name, category, sub_category, requirement_type, sort_order, handler_key, manual_instructions, source_section`);
lines.push(`)`);
lines.push(`select distinct`);
lines.push(`  r.requirement_id, r.requirement_name, r.requirement_name,`);
lines.push(`  coalesce(r.requirement_category, 'Unknown'), coalesce(r.requirement_sub_category, ''),`);
lines.push(`  r.requirement_type::public.requirement_definition_type, 9999,`);
lines.push(`  coalesce(r.handler_used, 'manualRequirementHandler'),`);
lines.push(`  'Imported from historical scan result snapshot.', coalesce(r.requirement_sub_category, '')`);
lines.push(`from public.requirement_check_results r`);
lines.push(`where not exists (select 1 from public.requirement_definitions d where d.id = r.requirement_id)`);
lines.push(`on conflict (id) do nothing;`);
lines.push("");
lines.push(`do $$`);
lines.push(`begin`);
lines.push(`  if not exists (`);
lines.push(`    select 1 from pg_constraint`);
lines.push(`    where conname = 'requirement_check_results_requirement_id_fkey'`);
lines.push(`      and conrelid = 'public.requirement_check_results'::regclass`);
lines.push(`  ) then`);
lines.push(`    alter table public.requirement_check_results`);
lines.push(`      add constraint requirement_check_results_requirement_id_fkey`);
lines.push(`      foreign key (requirement_id) references public.requirement_definitions (id) on update cascade;`);
lines.push(`  end if;`);
lines.push(`end $$;`);
lines.push("");

const outPath = path.join(
  process.cwd(),
  "supabase",
  "requirement_definitions_seed.sql",
);
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Wrote ${REQUIREMENT_DEFINITIONS.length} definitions to ${outPath}`);
