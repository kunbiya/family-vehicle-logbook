import { authorize, database, json, apiFailure } from "@/lib/vehicle-api";
import { vehicleSettingsSchema, serializeMaintenanceItems, DEFAULT_MAINTENANCE_ITEMS } from "@/lib/vehicle-records";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const payload = vehicleSettingsSchema.parse(await request.json());
    await database().prepare("INSERT INTO vehicle_settings (id, model, plate, owner, maintenance_items, updated_at, mileage) VALUES ('primary', ?, ?, '', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET model = excluded.model, plate = excluded.plate, mileage = excluded.mileage, updated_at = excluded.updated_at")
      .bind(payload.model, payload.plate, serializeMaintenanceItems(DEFAULT_MAINTENANCE_ITEMS), Date.now(), payload.mileage).run();
    return json({ status: "success", message: "차량 설정을 저장했습니다." });
  } catch (error) { return apiFailure(error); }
}
