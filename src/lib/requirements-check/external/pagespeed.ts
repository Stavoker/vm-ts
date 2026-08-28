export type PageSpeedResult = {
  performanceScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  mobileFriendly: boolean | null;
  error?: string;
};

type PageSpeedApiResponse = {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<
      string,
      { numericValue?: number; score?: number; displayValue?: string }
    >;
  };
  error?: { message?: string };
};

export async function fetchPageSpeed(url: string): Promise<PageSpeedResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const params = new URLSearchParams({
    url,
    strategy: "mobile",
    category: "performance",
  });
  if (apiKey) params.set("key", apiKey);

  try {
    const response = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
      { signal: AbortSignal.timeout(60_000) },
    );
    const data = (await response.json()) as PageSpeedApiResponse;
    if (!response.ok) {
      return {
        performanceScore: null,
        lcpMs: null,
        cls: null,
        mobileFriendly: null,
        error: data.error?.message || `PageSpeed API HTTP ${response.status}`,
      };
    }

    const lighthouse = data.lighthouseResult;
    const performanceScore =
      lighthouse?.categories?.performance?.score != null
        ? Math.round(lighthouse.categories.performance.score * 100)
        : null;
    const lcpMs = lighthouse?.audits?.["largest-contentful-paint"]?.numericValue ?? null;
    const cls = lighthouse?.audits?.["cumulative-layout-shift"]?.numericValue ?? null;
    const viewportAudit = lighthouse?.audits?.viewport;
    const mobileFriendly =
      viewportAudit?.score != null ? viewportAudit.score >= 0.9 : performanceScore != null;

    return { performanceScore, lcpMs, cls, mobileFriendly };
  } catch (error) {
    return {
      performanceScore: null,
      lcpMs: null,
      cls: null,
      mobileFriendly: null,
      error: error instanceof Error ? error.message : "PageSpeed request failed",
    };
  }
}
