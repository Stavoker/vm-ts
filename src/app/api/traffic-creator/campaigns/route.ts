import { NextResponse } from "next/server";
import { jsonTrafficError, listTrafficCampaigns } from "@/lib/traffic-creator/client";

export async function GET() {
  try {
    const campaigns = await listTrafficCampaigns();
    return NextResponse.json({ campaigns });
  } catch (error) {
    const mapped = jsonTrafficError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
