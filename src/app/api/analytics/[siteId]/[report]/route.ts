import { getBounceBreakdown, getCampaigns, getCountries, getDevices, getLandingPages, getOverview, getRealtime, getSources, getTimeseries, testGa4Connection } from "@/lib/analytics/ga4-reports";
import { assertSiteId, jsonError, jsonOk, parseAnalyticsQuery, queryToRange } from "@/lib/analytics/query";

type Params = { params: Promise<{ siteId: string; report: string }> };

const REPORTS = new Set([
  "overview",
  "realtime",
  "timeseries",
  "countries",
  "devices",
  "sources",
  "campaigns",
  "landing-pages",
  "bounce",
]);

export async function GET(request: Request, { params }: Params) {
  try {
    const { siteId, report } = await params;
    assertSiteId(siteId);
    if (!REPORTS.has(report)) {
      return jsonError(new Error("Unknown analytics report"));
    }
    const query = parseAnalyticsQuery(request);
    const range = queryToRange(query);
    const ctx = { query, range };

    switch (report) {
      case "overview":
        return jsonOk(await getOverview(siteId, ctx));
      case "realtime":
        return jsonOk(await getRealtime(siteId, ctx));
      case "timeseries":
        return jsonOk(await getTimeseries(siteId, ctx));
      case "countries":
        return jsonOk(await getCountries(siteId, ctx));
      case "devices":
        return jsonOk(await getDevices(siteId, ctx));
      case "sources":
        return jsonOk(await getSources(siteId, ctx));
      case "campaigns":
        return jsonOk(await getCampaigns(siteId, ctx));
      case "landing-pages":
        return jsonOk(await getLandingPages(siteId, ctx));
      case "bounce":
        return jsonOk(await getBounceBreakdown(siteId, ctx));
      default:
        return jsonError(new Error("Unknown analytics report"));
    }
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const { siteId, report } = await params;
    assertSiteId(siteId);
    if (report !== "test") {
      return jsonError(new Error("Unknown analytics action"));
    }
    return jsonOk(await testGa4Connection(siteId));
  } catch (error) {
    return jsonError(error);
  }
}
