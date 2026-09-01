import fs from "node:fs/promises";
import path from "node:path";
import { createServerSupabase } from "@/lib/supabase";
import { isWebsiteScanDisabled } from "./registry/load-definitions";
import { loadRequirementDefinitions } from "./registry/load-definitions";
import type {
  RequirementCheckSession,
  RequirementResultRow,
  ScanCredentials,
  ScanEvent,
  ScanStatus,
} from "./types";

const credentialVault = new Map<string, ScanCredentials>();

export function setScanCredentials(sessionId: string, credentials?: ScanCredentials) {
  if (!credentials?.login || !credentials.password) {
    credentialVault.delete(sessionId);
    return;
  }
  credentialVault.set(sessionId, credentials);
}

export function getScanCredentials(sessionId: string): ScanCredentials | undefined {
  return credentialVault.get(sessionId);
}

export function clearScanCredentials(sessionId: string) {
  credentialVault.delete(sessionId);
}

export function getScanStorageDir(sessionId: string): string {
  return path.join(process.cwd(), ".data", "requirements-check", sessionId);
}

export async function ensureScanStorageDir(sessionId: string): Promise<string> {
  const dir = getScanStorageDir(sessionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function createScanSession(input: {
  websiteUrl: string;
  hostname: string;
  credentials?: ScanCredentials;
}): Promise<RequirementCheckSession> {
  const definitions = await loadRequirementDefinitions({ enabledOnly: true });
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("requirement_check_sessions")
    .insert({
      website_url: input.websiteUrl,
      hostname: input.hostname,
      status: "pending",
      total_requirements: definitions.length,
      has_credentials: Boolean(input.credentials?.login && input.credentials?.password),
      login_page_url: input.credentials?.loginPageUrl || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  setScanCredentials(String(data.id), input.credentials);
  return data as RequirementCheckSession;
}

export async function getScanSession(id: string): Promise<RequirementCheckSession | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("requirement_check_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RequirementCheckSession | null) ?? null;
}

export async function listScanSessions(limit = 20): Promise<RequirementCheckSession[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("requirement_check_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as RequirementCheckSession[];
}

export async function updateScanSession(
  id: string,
  patch: Partial<RequirementCheckSession>,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("requirement_check_sessions")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function appendScanEvent(
  sessionId: string,
  eventType: string,
  message: string,
  payload?: Record<string, unknown>,
): Promise<ScanEvent> {
  const supabase = createServerSupabase();
  const event = {
    session_id: sessionId,
    event_type: eventType,
    message,
    payload: payload || null,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("requirement_check_events")
    .insert(event)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as ScanEvent;
}

export async function saveRequirementResults(
  sessionId: string,
  rows: Omit<RequirementResultRow, "id" | "created_at">[],
): Promise<void> {
  const supabase = createServerSupabase();
  const { error: deleteError } = await supabase
    .from("requirement_check_results")
    .delete()
    .eq("session_id", sessionId);
  if (deleteError) throw new Error(deleteError.message);

  if (rows.length === 0) return;
  const { error } = await supabase.from("requirement_check_results").insert(
    rows.map((row) => ({
      session_id: sessionId,
      requirement_id: row.requirement_id,
      requirement_name: row.requirement_name,
      requirement_category: row.requirement_category,
      requirement_sub_category: row.requirement_sub_category,
      requirement_type: row.requirement_type,
      weight: row.weight,
      status: row.status,
      explanation: row.explanation,
      checked_url: row.checked_url || null,
      evidence: row.evidence || null,
      confidence: row.confidence || null,
      handler_used: row.handler_used || null,
      started_at: row.started_at || null,
      completed_at: row.completed_at || null,
    })),
  );
  if (error) throw new Error(error.message);
}

export async function listRequirementResults(sessionId: string): Promise<RequirementResultRow[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("requirement_check_results")
    .select("*")
    .eq("session_id", sessionId)
    .order("requirement_category", { ascending: true })
    .order("requirement_sub_category", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data || []) as RequirementResultRow[]).filter(
    (row) => !isWebsiteScanDisabled(row.requirement_id),
  );
}

export async function listScanEvents(sessionId: string, limit = 200): Promise<ScanEvent[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("requirement_check_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as ScanEvent[];
}

export async function saveDiscoveredPages(
  sessionId: string,
  pages: { url: string; page_type: string; http_status?: number | null; title?: string | null; checked?: boolean }[],
): Promise<void> {
  const supabase = createServerSupabase();
  await supabase.from("requirement_discovered_pages").delete().eq("session_id", sessionId);
  if (pages.length === 0) return;
  const { error } = await supabase.from("requirement_discovered_pages").insert(
    pages.map((page) => ({ ...page, session_id: sessionId, checked: page.checked ?? false })),
  );
  if (error) throw new Error(error.message);
}

export async function setScanStatus(id: string, status: ScanStatus, errorMessage?: string | null) {
  await updateScanSession(id, {
    status,
    error_message: errorMessage ?? null,
    ...(status === "completed" || status === "failed" || status === "cancelled"
      ? { completed_at: new Date().toISOString() }
      : {}),
  });
}

export async function deleteScanSession(id: string): Promise<void> {
  const { cancelScan } = await import("./engine/runner");
  const { closeScanBrowser } = await import("./browser/playwright");
  cancelScan(id);
  await closeScanBrowser(id).catch(() => undefined);

  const supabase = createServerSupabase();
  const { error } = await supabase.from("requirement_check_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await fs.rm(getScanStorageDir(id), { recursive: true, force: true }).catch(() => undefined);
  clearScanCredentials(id);
}
