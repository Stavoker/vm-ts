import { checkSiteUrl, shouldNotify } from "@/lib/monitor";
import { createServerSupabase } from "@/lib/supabase";
import { buildStatusAlert, sendTelegramMessage } from "@/lib/telegram";
import type { Site } from "@/lib/types";

export type CheckSummary = {
  checked: number;
  changed: number;
  notified: number;
  skipped?: boolean;
  results: Array<{
    id: string;
    name: string;
    url: string;
    previous: string | null;
    status: string;
    status_reason: string | null;
    http_status: number | null;
    notified: boolean;
  }>;
};

let checkInFlight: Promise<CheckSummary> | null = null;

async function runSiteChecksInternal(siteIds?: string[]): Promise<CheckSummary> {
  const supabase = createServerSupabase();

  let query = supabase.from("sites").select("*").eq("is_active", true);
  if (siteIds?.length) {
    query = query.in("id", siteIds);
  }

  const { data: sites, error } = await query.order("name");
  if (error) {
    throw new Error(error.message);
  }

  const summary: CheckSummary = {
    checked: 0,
    changed: 0,
    notified: 0,
    results: [],
  };

  for (const site of (sites || []) as Site[]) {
    const previous = site.status;
    const result = await checkSiteUrl(site.url);
    const now = new Date().toISOString();
    const changed = previous !== result.status;
    const notify = shouldNotify(previous, result.status, {
      isFirstCheck: !site.last_checked_at,
    });

    const updatePayload = {
      status: result.status,
      status_reason: result.status_reason,
      http_status: result.http_status,
      response_time_ms: result.response_time_ms,
      last_checked_at: now,
      last_online_at: result.status === "online" ? now : site.last_online_at,
    };

    const { error: updateError } = await supabase
      .from("sites")
      .update(updatePayload)
      .eq("id", site.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    let notified = false;
    if (notify) {
      notified = await sendTelegramMessage(
        buildStatusAlert({ ...site, ...updatePayload }, previous),
      );
      if (notified) summary.notified += 1;
    }

    await supabase.from("site_checks").insert({
      site_id: site.id,
      status: result.status,
      http_status: result.http_status,
      response_time_ms: result.response_time_ms,
      status_reason: result.status_reason,
      notified,
    });

    summary.checked += 1;
    if (changed) summary.changed += 1;
    summary.results.push({
      id: site.id,
      name: site.name,
      url: site.url,
      previous,
      status: result.status,
      status_reason: result.status_reason,
      http_status: result.http_status,
      notified,
    });
  }

  return summary;
}

export async function runSiteChecks(siteIds?: string[]): Promise<CheckSummary> {
  if (checkInFlight) {
    const summary = await checkInFlight;
    return { ...summary, skipped: true };
  }

  checkInFlight = runSiteChecksInternal(siteIds).finally(() => {
    checkInFlight = null;
  });

  return checkInFlight;
}
