import { authorize, database, json, apiFailure } from "@/lib/vehicle-api";
import { recordSchema, maintenanceItemsFrom } from "@/lib/vehicle-records";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const user = access.user!;
    const payload = recordSchema.parse(await request.json());
    const hashBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
    const hash = Array.from(new Uint8Array(hashBytes), (b) => b.toString(16).padStart(2, "0")).join("");
    const db = database();
    const table = payload.kind === "trip" ? "trips" : "maintenance";
    const existing = () => db.prepare(`SELECT created_by AS createdBy, payload_hash AS payloadHash FROM ${table} WHERE id = ?`).bind(payload.submissionKey).first<{ createdBy: string; payloadHash: string }>();
    const previous = await existing();
    const matches = (row: { createdBy: string; payloadHash: string }) => row.createdBy === user.userId && row.payloadHash === hash;
    if (previous) {
      return matches(previous)
        ? json({ status: "success", id: payload.submissionKey, message: "이미 저장된 기록입니다." })
        : json({ status: "duplicate_submission", message: "저장 요청이 다른 기록과 겹칩니다. 창을 닫고 다시 입력해 주세요." }, 409);
    }
    if (payload.kind === "trip") {
      await db.prepare("INSERT INTO trips (id, created_by, payload_hash, created_at, date, driver, route, departure, destination, purpose, start_km, end_km, type, expense, expense_detail, note) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, '', ?, ?, '', ?, ?, ?) ON CONFLICT(id) DO NOTHING")
        .bind(payload.submissionKey, user.userId, hash, Date.now(), payload.date, `${payload.departure} → ${payload.destination}`, payload.departure, payload.destination, payload.startKm, payload.endKm, payload.expense, payload.expenseDetail, payload.note).run();
    } else {
      const settings = await db.prepare("SELECT maintenance_items AS maintenanceItems FROM vehicle_settings WHERE id = 'primary'").first<{ maintenanceItems: string }>();
      if (!maintenanceItemsFrom(settings?.maintenanceItems).includes(payload.item)) {
        return json({ status: "invalid_request", message: "차량 설정에 등록된 정비 항목을 선택해 주세요." }, 400);
      }
      await db.prepare("INSERT INTO maintenance (id, created_by, payload_hash, created_at, date, mileage, item, other_item, detail, vendor, cost, next_mileage, note, next_date, receipt_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
        .bind(payload.submissionKey, user.userId, hash, Date.now(), payload.date, payload.mileage, payload.item, payload.otherItem, payload.detail, payload.vendor, payload.cost, payload.nextMileage === "" ? null : payload.nextMileage, payload.note, payload.nextDate, payload.receiptUrl).run();
    }
    const stored = await existing();
    if (!stored || !matches(stored)) return json({ status: "duplicate_submission", message: "저장 요청을 확인한 뒤 다시 시도해 주세요." }, 409);
    return json({ status: "success", id: payload.submissionKey, message: "기록을 저장했습니다." });
  } catch (error) { return apiFailure(error); }
}
