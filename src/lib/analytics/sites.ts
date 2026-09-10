import { createServerSupabase } from "@/lib/supabase";
import { AnalyticsError } from "./errors";
import { hostnameFromUrl } from "./timezone";
import type { AnalyticsSite } from "./types";

type SiteRow = {
  id: string;
  name: string;
  url: string;
  ga4_property_id: string | null;
  ga4_measurement_id: string | null;
  ga4_enabled: boolean | null;
};

function toAnalyticsSite(row: SiteRow): AnalyticsSite | null {
  const propertyId = row.ga4_property_id?.trim();
  if (!row.ga4_enabled || !propertyId) return null;
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    domain: hostnameFromUrl(row.url),
    ga4_property_id: propertyId,
    ga4_measurement_id: row.ga4_measurement_id,
    ga4_enabled: true,
  };
}

export async function listGa4Sites(): Promise<AnalyticsSite[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("sites")
    .select("id, name, url, ga4_property_id, ga4_measurement_id, ga4_enabled")
    .eq("ga4_enabled", true)
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as SiteRow[]).map(toAnalyticsSite).filter((site): site is AnalyticsSite => Boolean(site));
}

export async function getGa4Site(siteId: string): Promise<AnalyticsSite> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("sites")
    .select("id, name, url, ga4_property_id, ga4_measurement_id, ga4_enabled")
    .eq("id", siteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AnalyticsError("invalid_query", "Site not found", 404);
  const site = toAnalyticsSite(data as SiteRow);
  if (!site) {
    throw new AnalyticsError("not_connected", "No GA4 property connected", 400);
  }
  return site;
}

export async function resolveAnalyticsSites(siteId: string): Promise<AnalyticsSite[]> {
  if (siteId === "all") {
    const sites = await listGa4Sites();
    if (sites.length === 0) {
      throw new AnalyticsError("not_connected", "No GA4 property connected", 400);
    }
    return sites;
  }
  return [await getGa4Site(siteId)];
}
