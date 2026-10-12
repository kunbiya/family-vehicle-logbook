import { authorize, database, json, apiFailure } from "@/lib/vehicle-api";
import { displayRecords, maintenanceItemsFrom } from "@/lib/vehicle-records";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const access = await authorize(request);
    if (access.response) return access.response;
    const db = database();
    const [settings, trips, maintenance] = await db.batch<Record<string, unknown>>([
      db.prepare("SELECT model, plate, mileage, maintenance_items AS maintenanceItems FROM vehicle_settings WHERE id = 'primary'"),
      db.prepare("SELECT id, date, route, departure, destination, start_km AS startKm, end_km AS endKm, type, expense, expense_detail AS expenseDetail, note FROM trips ORDER BY date, created_at, id"),
      db.prepare("SELECT id, date, mileage, item, other_item AS otherItem, detail, vendor, cost, next_mileage AS nextMileage, note, next_date AS nextDate, receipt_url AS receiptUrl FROM maintenance ORDER BY date, created_at, id"),
    ]);
    const profile = settings.results[0] as { model: string; plate: string; mileage: number; maintenanceItems: string } | undefined;
    const tripMileage = trips.results.reduce((max, record) => Math.max(max, Number(record.endKm) || 0), Number(profile?.mileage) || 0);
    const currentMileage = maintenance.results.reduce((max, record) => Math.max(max, Number(record.mileage) || 0), tripMileage);
    return json({ status: "success", data: {
      profile: { model: profile?.model ?? "", plate: profile?.plate ?? "", mileage: String(currentMileage) },
      ...displayRecords(trips.results, maintenance.results),
      maintenanceItems: maintenanceItemsFrom(profile?.maintenanceItems),
      syncedAt: new Date().toISOString(),
    } });
  } catch (error) { return apiFailure(error); }
}
