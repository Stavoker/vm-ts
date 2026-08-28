export type WaybackResult = {
  firstSnapshotDate: string | null;
  ageDays: number | null;
  snapshotCount: number;
  error?: string;
};

export async function fetchWaybackHistory(hostname: string): Promise<WaybackResult> {
  const url = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(hostname)}&output=json&fl=timestamp&filter=statuscode:200&limit=1000`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "VitrinaRequirementsCheck/1.0" },
    });
    if (!response.ok) {
      return {
        firstSnapshotDate: null,
        ageDays: null,
        snapshotCount: 0,
        error: `Wayback CDX HTTP ${response.status}`,
      };
    }

    const rows = (await response.json()) as string[][];
    if (!Array.isArray(rows) || rows.length < 2) {
      return { firstSnapshotDate: null, ageDays: null, snapshotCount: 0 };
    }

    const timestamps = rows
      .slice(1)
      .map((row) => row[0])
      .filter(Boolean)
      .sort();

    const first = timestamps[0];
    if (!first || first.length < 8) {
      return { firstSnapshotDate: null, ageDays: null, snapshotCount: timestamps.length };
    }

    const firstDate = `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}`;
    const ageDays = Math.floor(
      (Date.now() - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000,
    );

    return {
      firstSnapshotDate: firstDate,
      ageDays,
      snapshotCount: timestamps.length,
    };
  } catch (error) {
    return {
      firstSnapshotDate: null,
      ageDays: null,
      snapshotCount: 0,
      error: error instanceof Error ? error.message : "Wayback request failed",
    };
  }
}
