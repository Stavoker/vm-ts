export type TrafficCreatorPack = {
  visits: number;
  priceUsd: number;
  cpmUsd: number;
  label: string;
};

export type TrafficCostSummary = {
  sourceUrl: string;
  sourceName: string;
  activePack: TrafficCreatorPack;
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
export const DEFAULT_PACK_VISITS = 600_000;
export const EXPERT_PRICE_MULTIPLIER = 1.4;

/** Official Professional packs from traffic-creator.com/pricing (checked 2026-09). */
export const TRAFFIC_CREATOR_PROFESSIONAL_PACKS: TrafficCreatorPack[] = [
  pack(60_000, 19.95, "60 тис."),
  pack(300_000, 59.95, "300 тис."),
  pack(600_000, 114.95, "600 тис."),
  pack(1_000_000, 189.95, "1 млн"),
  pack(3_000_000, 489.95, "3 млн"),
];

export function findPack(visits: unknown): TrafficCreatorPack | null {
  const n = Number(visits);
  if (!Number.isFinite(n)) return null;
  return TRAFFIC_CREATOR_PROFESSIONAL_PACKS.find((item) => item.visits === n) ?? null;
}

export function requirePack(visits: unknown): TrafficCreatorPack {
  const pack = findPack(visits) ?? findPack(DEFAULT_PACK_VISITS);
  if (!pack) throw new Error("Traffic Creator pack is not configured");
  return pack;
}

export function packVisitsFromMetadata(raw: unknown): number | undefined {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const pack = findPack(record?.pack_visits);
  return pack?.visits;
}

export function costForVisits(visits: number, cpmUsd: number): number {
  if (!Number.isFinite(visits) || visits <= 0 || !Number.isFinite(cpmUsd)) return 0;
  return (visits / 1000) * cpmUsd;
}

export function buildTrafficCostSummary(input: {
  packVisits: number;
  sessions: number;
  users: number;
  previousSessions?: number;
  previousUsers?: number;
}): TrafficCostSummary {
  const activePack = requirePack(input.packVisits);
  const expertCpmUsd = roundCpm(activePack.priceUsd * EXPERT_PRICE_MULTIPLIER, activePack.visits);
  return {
    sourceUrl: TRAFFIC_CREATOR_SOURCE_URL,
    sourceName: TRAFFIC_CREATOR_SOURCE_NAME,
    activePack,
    professionalCpmUsd: activePack.cpmUsd,
    expertCpmUsd,
    sessionsCostUsd: costForVisits(input.sessions, activePack.cpmUsd),
    usersCostUsd: costForVisits(input.users, activePack.cpmUsd),
    previousSessionsCostUsd: costForVisits(input.previousSessions ?? 0, activePack.cpmUsd),
    previousUsersCostUsd: costForVisits(input.previousUsers ?? 0, activePack.cpmUsd),
    packs: TRAFFIC_CREATOR_PROFESSIONAL_PACKS,
  };
}

function pack(visits: number, priceUsd: number, label: string): TrafficCreatorPack {
  return { visits, priceUsd, cpmUsd: roundCpm(priceUsd, visits), label };
}

function roundCpm(priceUsd: number, visits: number): number {
  return Math.round((priceUsd / (visits / 1000)) * 100) / 100;
}
