export type TrafficCreatorPack = {
  visits: number;
  priceUsd: number;
  cpmUsd: number;
  label: string;
};

export type TrafficCostSummary = {
  sourceUrl: string;
  sourceName: string;
  professionalCpmUsd: number;
  expertCpmUsd: number;
  sessionsCostUsd: number;
  usersCostUsd: number;
  previousSessionsCostUsd: number;
  previousUsersCostUsd: number;
  packs: TrafficCreatorPack[];
};

export const TRAFFIC_CREATOR_SOURCE_URL = "https://traffic-creator.com/";
export const TRAFFIC_CREATOR_SOURCE_NAME = "Traffic Creator";

/** Official Professional packs from traffic-creator.com/pricing (checked 2026-09). */
export const TRAFFIC_CREATOR_PROFESSIONAL_PACKS: TrafficCreatorPack[] = [
  pack(60_000, 19.95, "60 тис."),
  pack(300_000, 59.95, "300 тис."),
  pack(600_000, 114.95, "600 тис."),
  pack(1_000_000, 189.95, "1 млн"),
  pack(3_000_000, 489.95, "3 млн"),
];

export const TRAFFIC_CREATOR_STARTER_CPM_USD = TRAFFIC_CREATOR_PROFESSIONAL_PACKS[0].cpmUsd;
export const TRAFFIC_CREATOR_EXPERT_STARTER_PRICE_USD = 27.95;
export const TRAFFIC_CREATOR_EXPERT_STARTER_CPM_USD = roundCpm(TRAFFIC_CREATOR_EXPERT_STARTER_PRICE_USD, 60_000);

export function costForVisits(visits: number, cpmUsd = TRAFFIC_CREATOR_STARTER_CPM_USD): number {
  if (!Number.isFinite(visits) || visits <= 0 || !Number.isFinite(cpmUsd)) return 0;
  return (visits / 1000) * cpmUsd;
}

export function buildTrafficCostSummary(input: {
  sessions: number;
  users: number;
  previousSessions?: number;
  previousUsers?: number;
}): TrafficCostSummary {
  return {
    sourceUrl: TRAFFIC_CREATOR_SOURCE_URL,
    sourceName: TRAFFIC_CREATOR_SOURCE_NAME,
    professionalCpmUsd: TRAFFIC_CREATOR_STARTER_CPM_USD,
    expertCpmUsd: TRAFFIC_CREATOR_EXPERT_STARTER_CPM_USD,
    sessionsCostUsd: costForVisits(input.sessions),
    usersCostUsd: costForVisits(input.users),
    previousSessionsCostUsd: costForVisits(input.previousSessions ?? 0),
    previousUsersCostUsd: costForVisits(input.previousUsers ?? 0),
    packs: TRAFFIC_CREATOR_PROFESSIONAL_PACKS,
  };
}

function pack(visits: number, priceUsd: number, label: string): TrafficCreatorPack {
  return { visits, priceUsd, cpmUsd: roundCpm(priceUsd, visits), label };
}

function roundCpm(priceUsd: number, visits: number): number {
  return Math.round((priceUsd / (visits / 1000)) * 100) / 100;
}
