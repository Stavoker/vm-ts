import { NextResponse } from "next/server";
import { setReminderStatus } from "@/lib/reminders";
import type { ReminderStatus } from "@/lib/reminder-types";

type Params = { params: Promise<{ id: string }> };

const STATUSES: ReminderStatus[] = ["pending", "later", "payed"];

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { status?: ReminderStatus };
    if (!body.status || !STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
    }
    const reminder = await setReminderStatus(id, body.status);
    return NextResponse.json({ reminder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
