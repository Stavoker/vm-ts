import { createServerSupabase } from "@/lib/supabase";
import type { RequirementCheckType, RequirementDefinition } from "../types";

export type RequirementDefinitionRow = {
  id: string;
  original_name: string;
  display_name: string;
  original_description: string;
  category: string;
  sub_category: string;
  requirement_type: RequirementCheckType;
  weight: number;
  severity: string;
  enabled: boolean;
  sort_order: number;
  handler_key: string;
  manual_instructions: string;
  evidence_requirements: string[] | null;
  config: Record<string, unknown> | null;
  source_reference: string;
  source_section: string;
  source_row: number | null;
  created_at: string;
  updated_at: string;
};

let cached: { items: RequirementDefinition[]; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function mapDefinitionRow(row: RequirementDefinitionRow): RequirementDefinition {
  const config = row.config || {};
  return {
    id: row.id,
    originalName: row.original_name,
    displayName: row.display_name,
    originalDescription: row.original_description || "",
    category: row.category,
    subCategory: row.sub_category || "",
    type: row.requirement_type,
    weight: Number(row.weight) || 1,
    severity: (row.severity as RequirementDefinition["severity"]) || "medium",
    enabled: row.enabled,
    order: row.sort_order,
    automationHandler: row.handler_key,
    manualInstructions: row.manual_instructions || "",
    evidenceRequirements: row.evidence_requirements || [],
    sourceReference: row.source_reference,
    sourceSection: row.source_section || "",
    originalOrder: row.source_row || row.sort_order,
    mandatoryLevel: String(config.mandatoryLevel || "Required / check"),
    config: config,
  };
}

export function clearRequirementDefinitionsCache(): void {
  cached = null;
}

export async function loadRequirementDefinitions(options?: {
  enabledOnly?: boolean;
  bypassCache?: boolean;
}): Promise<RequirementDefinition[]> {
  const enabledOnly = options?.enabledOnly ?? false;
  const bypassCache = options?.bypassCache ?? false;

  if (
    !bypassCache &&
    cached &&
    Date.now() - cached.loadedAt < CACHE_TTL_MS
  ) {
    return enabledOnly
      ? cached.items.filter((item) => item.enabled)
      : cached.items;
  }

  const supabase = createServerSupabase();
  let query = supabase
    .from("requirement_definitions")
    .select("*")
    .order("sort_order", { ascending: true });

  if (enabledOnly) {
    query = query.eq("enabled", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Failed to load requirement_definitions: ${error.message}. Run supabase/requirement_definitions.sql and requirement_definitions_seed.sql.`,
    );
  }

  const items = ((data || []) as RequirementDefinitionRow[]).map(mapDefinitionRow);
  if (items.length === 0) {
    throw new Error(
      "requirement_definitions is empty. Run supabase/requirement_definitions_seed.sql in Supabase.",
    );
  }

  cached = { items, loadedAt: Date.now() };
  return enabledOnly ? items.filter((item) => item.enabled) : items;
}

export async function countRequirementDefinitions(): Promise<number> {
  const supabase = createServerSupabase();
  const { count, error } = await supabase
    .from("requirement_definitions")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count || 0;
}
