import { authorize, database, json, apiFailure } from "@/lib/vehicle-api";
import { maintenanceItemsSchema, serializeMaintenanceItems } from "@/lib/vehicle-records";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const payload = maintenanceItemsSchema.parse(await request.json());
    await database().prepare("INSERT INTO vehicle_settings (id, model, plate, owner, maintenance_items, updated_at, mileage) VALUES ('primary', '', '', '', ?, ?, 0) ON CONFLICT(id) DO UPDATE SET maintenance_items = excluded.maintenance_items, updated_at = excluded.updated_at")
      .bind(serializeMaintenanceItems(payload.maintenanceItems), Date.now()).run();
    return json({ status: "success", message: "정비 항목 목록을 저장했습니다." });
  } catch (error) { return apiFailure(error); }
}
