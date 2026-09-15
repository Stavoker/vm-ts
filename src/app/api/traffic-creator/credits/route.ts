import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { hostnameFromUrl } from "@/lib/analytics/timezone";
import { parseAnalyticsQuery, queryToRange } from "@/lib/analytics/query";
import { getTrafficCreditUsage, jsonTrafficError } from "@/lib/traffic-creator/client";

export async function GET(request: Request) {
  try {
    const query = parseAnalyticsQuery(request);
    const range = queryToRange(query);
    const url = new URL(request.url);
    const siteId = url.searchParams.get("siteId")?.trim() || "all";
    const site = siteId !== "all" ? await loadSite(siteId) : null;
    const usage = await getTrafficCreditUsage({
      startDate: range.startDate,
      endDate: range.endDate,
      label: range.label,
      site,
    });
    return NextResponse.json({ usage });
  } catch (error) {
    const mapped = jsonTrafficError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

async function loadSite(siteId: string) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("sites")
    .select("id, name, url")
    .eq("id", siteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    name: data.name as string,
    url: data.url as string,
    domain: hostnameFromUrl(data.url as string),
  };
}
