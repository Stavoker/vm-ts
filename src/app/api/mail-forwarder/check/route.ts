import { NextResponse } from "next/server";
import { ConfigError } from "@/lib/mail-forwarder/errors";
import { checkForwarder } from "@/lib/mail-forwarder/runtime";

export async function POST() {
  try {
    const result = await checkForwarder();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = error instanceof ConfigError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
