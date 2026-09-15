export type JsonRecord = Record<string, unknown>;

export type TrafficBalanceTier = {
  tier: string;
  credits: number;
};

export type TrafficBalance = {
  credits: number | null;
  tiers: TrafficBalanceTier[];
};

export type TrafficCampaign = {
  id: string;
  name: string;
  status: string;
  url: string | null;
  daily_limit: number | null;
  total_target: number | null;
  delivered: number | null;
  remaining: number | null;
  settings_version: number | null;
  traffic_tier: string | null;
};

export type TrafficCreditDay = {
  date: string;
  credits: number;
};

export type TrafficCreditTier = {
  tier: string;
  label: string;
  credits: number;
  share: number;
};

export type TrafficCampaignCredits = {
  campaignId: string;
  campaignName: string;
  status: string;
  tier: string | null;
  total: number;
  perDayAvg: number;
  series: TrafficCreditDay[];
  tiers: TrafficCreditTier[];
  visitors: number;
  billed: number | null;
};

export type TrafficCreditUsage = {
  range: { startDate: string; endDate: string; label: string; days: number };
  balanceCredits: number | null;
  totalSpent: number;
  perDayAvg: number;
  series: TrafficCreditDay[];
  tiers: TrafficCreditTier[];
  campaigns: TrafficCampaignCredits[];
  partialErrors: { campaignId: string; campaignName: string; error: string }[];
};

export function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function numberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function stringish(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function unwrap(payload: unknown): JsonRecord {
  const root = asRecord(payload) ?? {};
  return asRecord(root.data) ?? asRecord(root.account) ?? root;
}

export function parseBalance(payload: unknown): TrafficBalance {
  const root = unwrap(payload);
  const rawCredits = root.credits ?? root.available ?? root.remaining ?? root.balance ?? root.available_credits;
  const creditsNumber = numberish(rawCredits);
  const rawTiers =
    root.by_tier ??
    root.tiers ??
    root.available_by_tier ??
    root.credits_by_tier ??
    (asRecord(rawCredits) ? rawCredits : null);
  const tiers = collectTiers(rawTiers);
  const credits = creditsNumber ?? (tiers.length ? tiers.reduce((sum, tier) => sum + tier.credits, 0) : null);
  return { credits, tiers };
}

function collectTiers(rawTiers: unknown): TrafficBalanceTier[] {
  const tiers: TrafficBalanceTier[] = [];
  if (Array.isArray(rawTiers)) {
    for (const item of rawTiers) {
      const row = asRecord(item);
      if (!row) continue;
      const tier = stringish(row.tier ?? row.name ?? row.traffic_tier) || "default";
      const amount = numberish(row.credits ?? row.available ?? row.balance ?? row.amount) ?? 0;
      tiers.push({ tier, credits: amount });
    }
    return tiers;
  }
  const record = asRecord(rawTiers);
  if (!record) return tiers;
  for (const [tier, amount] of Object.entries(record)) {
    const credits = numberish(amount);
    if (credits == null) continue;
    tiers.push({ tier, credits });
  }
  return tiers;
}

export function parseCampaign(payload: unknown): TrafficCampaign | null {
  const root = unwrap(payload);
  const campaign = asRecord(root.campaign) ?? root;
  const id = stringish(campaign.id ?? campaign.campaign_id);
  if (!id) return null;
  const settings = asRecord(campaign.settings);
  return {
    id,
    name: stringish(campaign.name ?? campaign.title ?? campaign.project_name) || id,
    status: stringish(campaign.status ?? campaign.state ?? campaign.delivery_status) || "unknown",
    url: stringish(campaign.url ?? campaign.website_url ?? campaign.target_url ?? settings?.url),
    daily_limit: numberish(
      campaign.daily_limit ?? campaign.dailyLimit ?? campaign.visits_per_day ?? settings?.daily_limit,
    ),
    total_target: numberish(campaign.total_target ?? campaign.target ?? campaign.visit_target),
    delivered: numberish(
      campaign.delivered ??
        campaign.delivered_visits ??
        campaign.visits_delivered ??
        campaign.total_hits ??
        campaign.visits,
    ),
    remaining: numberish(campaign.remaining ?? campaign.remaining_visits),
    settings_version: numberish(campaign.settings_version ?? campaign.settingsVersion),
    traffic_tier: stringish(campaign.traffic_tier ?? campaign.tier ?? settings?.traffic_tier),
  };
}

export function parseCampaignCredits(
  payload: unknown,
  campaign: Pick<TrafficCampaign, "id" | "name" | "status" | "traffic_tier">,
): TrafficCampaignCredits {
  const root = asRecord(payload) ?? {};
  const credits = asRecord(root.credits) ?? {};
  const project = asRecord(root.project) ?? {};
  const totals = asRecord(root.totals) ?? {};
  const delivery = asRecord(root.delivery_quality) ?? {};
  const series = asArray(credits.series)
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const date = stringish(row.date);
      const amount = numberish(row.credits ?? row.amount ?? row.value);
      if (!date || amount == null) return null;
      return { date: date.slice(0, 10), credits: amount };
    })
    .filter((item): item is TrafficCreditDay => Boolean(item));
  const tiers = asArray(credits.tiers)
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const tier = stringish(row.tier ?? row.name) || "unknown";
      const amount = numberish(row.credits ?? row.amount) ?? 0;
      const shareRaw = numberish(row.share) ?? 0;
      return {
        tier,
        label: stringish(row.label) || tier,
        credits: amount,
        share: shareRaw > 1 ? shareRaw / 100 : shareRaw,
      };
    })
    .filter((item): item is TrafficCreditTier => Boolean(item));
  const total = numberish(credits.total) ?? series.reduce((sum, row) => sum + row.credits, 0);
  const perDayAvg =
    numberish(credits.per_day_avg ?? credits.perDayAvg) ??
    (series.length ? total / series.length : 0);
  return {
    campaignId: campaign.id,
    campaignName: stringish(project.name) || campaign.name,
    status: stringish(project.status) || campaign.status,
    tier: stringish(project.tier) || campaign.traffic_tier,
    total,
    perDayAvg,
    series,
    tiers,
    visitors: numberish(totals.visitors) ?? 0,
    billed: numberish(delivery.billed),
  };
}

export function filterCreditSeries(
  series: TrafficCreditDay[],
  startDate: string,
  endDate: string,
): TrafficCreditDay[] {
  return series
    .filter((row) => row.date >= startDate && row.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeCreditSeries(seriesList: TrafficCreditDay[][]): TrafficCreditDay[] {
  const byDate = new Map<string, number>();
  for (const series of seriesList) {
    for (const row of series) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.credits);
    }
  }
  return [...byDate.entries()]
    .map(([date, credits]) => ({ date, credits }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeCreditTiers(tierLists: TrafficCreditTier[][]): TrafficCreditTier[] {
  const byTier = new Map<string, TrafficCreditTier>();
  for (const list of tierLists) {
    for (const row of list) {
      const current = byTier.get(row.tier);
      if (!current) {
        byTier.set(row.tier, { ...row });
        continue;
      }
      current.credits += row.credits;
    }
  }
  const total = [...byTier.values()].reduce((sum, row) => sum + row.credits, 0);
  return [...byTier.values()]
    .map((row) => ({
      ...row,
      share: total > 0 ? row.credits / total : 0,
    }))
    .sort((a, b) => b.credits - a.credits);
}

export function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function clampAnalyticsDays(days: number): number {
  if (!Number.isFinite(days)) return 7;
  return Math.min(90, Math.max(1, Math.round(days)));
}

export function parseCampaignList(payload: unknown): { campaigns: TrafficCampaign[]; nextCursor: string | null } {
  const root = asRecord(payload) ?? {};
  const nested = asRecord(root.data);
  const list = asArray(root.campaigns ?? nested?.campaigns ?? root.data ?? root.items ?? root.results);
  const campaigns = list.map(parseCampaign).filter((item): item is TrafficCampaign => Boolean(item));
  const nextCursor = stringish(root.next_cursor ?? root.after ?? nested?.next_cursor ?? nested?.after);
  return { campaigns, nextCursor };
}

export function isPausedStatus(status: string): boolean {
  return /pause|paused|stopped|halted/i.test(status);
}

export function isActiveStatus(status: string): boolean {
  return /active|running|deliver|live/i.test(status);
}
