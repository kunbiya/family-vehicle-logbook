import { z } from "zod/v4";
import { authorize, database, json, apiFailure } from "@/lib/vehicle-api";
import { tripSchema, displayRecords } from "@/lib/vehicle-records";

export const dynamic = "force-dynamic";
const idSchema = z.object({ id: z.uuid() }).passthrough();

export async function POST(request: Request) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const input = idSchema.parse(await request.json());
    const payload = tripSchema.parse({ ...input, kind: "trip", submissionKey: input.id });
    const updated = await database().prepare("UPDATE trips SET date = ?, route = ?, departure = ?, destination = ?, start_km = ?, end_km = ?, expense = ?, expense_detail = ?, note = ? WHERE id = ? RETURNING id, date, route, departure, destination, start_km AS startKm, end_km AS endKm, expense, expense_detail AS expenseDetail, note")
      .bind(payload.date, `${payload.departure} → ${payload.destination}`, payload.departure, payload.destination, payload.startKm, payload.endKm, payload.expense, payload.expenseDetail, payload.note, input.id).first<Record<string, unknown>>();
    if (!updated) return json({ status: "not_found", message: "이 운행 기록은 삭제되어 수정할 수 없습니다. 목록을 새로고침해 주세요." }, 404);
    return json({ status: "success", record: displayRecords([updated], []).trips[0] });
  } catch (error) { return apiFailure(error); }
}
