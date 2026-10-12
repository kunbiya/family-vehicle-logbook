import { z } from "zod/v4";
import { authorize, database, json, apiFailure } from "@/lib/vehicle-api";
import { maintenanceSchema, maintenanceItemsFrom, displayRecords } from "@/lib/vehicle-records";

export const dynamic = "force-dynamic";
const idSchema = z.object({ id: z.uuid() }).passthrough();

export async function POST(request: Request) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const input = idSchema.parse(await request.json());
    const payload = maintenanceSchema.parse({ ...input, kind: "maintenance", submissionKey: input.id });
    const db = database();
    const existing = await db.prepare("SELECT item FROM maintenance WHERE id = ?").bind(input.id).first<{ item: string }>();
    if (!existing) return json({ status: "not_found", message: "이 정비 기록은 삭제되어 수정할 수 없습니다. 목록을 새로고침해 주세요." }, 404);
    const settings = await db.prepare("SELECT maintenance_items AS maintenanceItems FROM vehicle_settings WHERE id = 'primary'").first<{ maintenanceItems: string }>();
    if (payload.item !== existing.item && !maintenanceItemsFrom(settings?.maintenanceItems).includes(payload.item)) {
      return json({ status: "invalid_request", message: "차량 설정에 등록된 정비 항목을 선택해 주세요." }, 400);
    }
    const updated = await db.prepare("UPDATE maintenance SET date = ?, mileage = ?, item = ?, other_item = ?, detail = ?, vendor = ?, cost = ?, next_mileage = ?, note = ?, next_date = ?, receipt_url = ? WHERE id = ? RETURNING id, date, mileage, item, other_item AS otherItem, detail, vendor, cost, next_mileage AS nextMileage, note, next_date AS nextDate, receipt_url AS receiptUrl")
      .bind(payload.date, payload.mileage, payload.item, payload.otherItem, payload.detail, payload.vendor, payload.cost, payload.nextMileage === "" ? null : payload.nextMileage, payload.note, payload.nextDate, payload.receiptUrl, input.id).first<Record<string, unknown>>();
    if (!updated) return json({ status: "not_found", message: "이 정비 기록은 삭제되어 수정할 수 없습니다. 목록을 새로고침해 주세요." }, 404);
    return json({ status: "success", record: displayRecords([], [updated]).maintenance[0] });
  } catch (error) { return apiFailure(error); }
}
