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
      campaign.delivered ?? campaign.delivered_visits ?? campaign.visits_delivered ?? campaign.visits,
    ),
    remaining: numberish(campaign.remaining ?? campaign.remaining_visits),
    settings_version: numberish(campaign.settings_version ?? campaign.settingsVersion),
    traffic_tier: stringish(campaign.traffic_tier ?? campaign.tier ?? settings?.traffic_tier),
  };
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
