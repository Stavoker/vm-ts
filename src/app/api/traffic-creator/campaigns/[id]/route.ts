import { NextResponse } from "next/server";
import {
  assertCampaignId,
  assertDailyLimit,
  jsonTrafficError,
  updateTrafficCampaignDailyLimit,
} from "@/lib/traffic-creator/client";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const campaignId = assertCampaignId(id);
    const body = (await request.json()) as { daily_limit?: unknown };
    const dailyLimit = assertDailyLimit(body.daily_limit);
    const campaign = await updateTrafficCampaignDailyLimit(campaignId, dailyLimit);
    return NextResponse.json({ campaign });
  } catch (error) {
    const mapped = jsonTrafficError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
