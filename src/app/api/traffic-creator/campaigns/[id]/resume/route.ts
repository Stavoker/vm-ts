import { NextResponse } from "next/server";
import { assertCampaignId, jsonTrafficError, resumeTrafficCampaign } from "@/lib/traffic-creator/client";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const campaign = await resumeTrafficCampaign(assertCampaignId(id));
    return NextResponse.json({ campaign });
  } catch (error) {
    const mapped = jsonTrafficError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
