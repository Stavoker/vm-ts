import { NextResponse } from "next/server";
import { getTrafficBalance, jsonTrafficError } from "@/lib/traffic-creator/client";

export async function GET() {
  try {
    const balance = await getTrafficBalance();
    return NextResponse.json({ balance });
  } catch (error) {
    const mapped = jsonTrafficError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
