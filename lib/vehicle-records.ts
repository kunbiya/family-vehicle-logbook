import { z } from "zod/v4";
import { DEFAULT_MAINTENANCE_ITEMS } from "./maintenance-catalog";
export { DEFAULT_MAINTENANCE_ITEMS } from "./maintenance-catalog";

const optionalText = z.string().trim().max(500).optional().default("");
const date = z.iso.date();
const requiredNumber = (max: number, integer = false) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  integer ? z.coerce.number().int().nonnegative().max(max) : z.coerce.number().nonnegative().max(max),
);
const mileage = requiredNumber(100_000_000);
const money = requiredNumber(1_000_000_000, true);
const optionalMileage = z.preprocess((value) => value === undefined || value === null || value === "" ? 0 : value, mileage);
const optionalMoney = z.preprocess((value) => value === undefined || value === null || value === "" ? 0 : value, money);

export const tripSchema = z.object({
  kind: z.literal("trip"), submissionKey: z.uuid(), date,
  departure: z.string().trim().min(1).max(160), destination: z.string().trim().min(1).max(160),
  startKm: mileage, endKm: mileage, expense: optionalMoney,
  expenseDetail: optionalText, note: optionalText,
}).refine((value) => value.endKm >= value.startKm, {
  message: "주행 후 계기판 값은 주행 전보다 작을 수 없습니다.", path: ["endKm"],
});

export const maintenanceSchema = z.object({
  kind: z.literal("maintenance"), submissionKey: z.uuid(), date, mileage: optionalMileage,
  item: z.string().trim().min(1).max(80), otherItem: z.string().trim().max(80).optional().default(""), detail: optionalText,
  vendor: optionalText, cost: optionalMoney,
  nextMileage: z.union([z.literal(""), mileage]).optional().default(""),
  note: optionalText, nextDate: z.union([z.literal(""), date]).optional().default(""),
  receiptUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ }).max(500)]).optional().default(""),
}).transform((payload) => ({ ...payload, otherItem: payload.item === "기타 정비" ? payload.otherItem : "" }));

export const recordSchema = z.union([tripSchema, maintenanceSchema]);
export type RecordPayload = z.infer<typeof recordSchema>;
export const vehicleSettingsSchema = z.object({
  model: z.string().trim().max(80), plate: z.string().trim().max(40), mileage: optionalMileage,
});
export const maintenanceItemsSchema = z.object({
  maintenanceItems: z.array(z.string().trim().min(1).max(80)).min(1).max(100).transform((items) => [...new Set(items)]),
});

export function maintenanceItemsFrom(value?: string) {
  if (!value) return [...DEFAULT_MAINTENANCE_ITEMS];
  const parsed = JSON.parse(value);
  // Add the source catalog to older settings, preserving the family's custom options.
  // Newly saved settings carry a version so future explicit list edits remain effective.
  if (Array.isArray(parsed)) {
    const aliases: Record<string, string> = { "기타": "기타 정비", "브레이크 패드": "브레이크패드", "브레이크 오일": "브레이크액" };
    const existing = maintenanceItemsSchema.shape.maintenanceItems.parse(parsed).map((item) => aliases[item] ?? item);
    return [...new Set([...DEFAULT_MAINTENANCE_ITEMS, ...existing])];
  }
  const saved = z.object({ version: z.literal(1), items: maintenanceItemsSchema.shape.maintenanceItems }).parse(parsed);
  return saved.items;
}

export function serializeMaintenanceItems(items: string[]) {
  return JSON.stringify({ version: 1, items });
}

export function displayRecords(trips: Record<string, unknown>[], maintenance: Record<string, unknown>[]) {
  let totalDistance = 0, businessDistance = 0, totalExpense = 0;
  const text = (value: unknown) => value === null || value === undefined ? "" : String(value);
  const formattedTrips = trips.map((trip) => {
    const distance = Number(trip.endKm) - Number(trip.startKm);
    totalDistance += distance;
    if (trip.type === "업무용") businessDistance += distance;
    totalExpense += Number(trip.expense);
    return {
      id: text(trip.id), date: text(trip.date), ...tripLocations(trip),
      startKm: text(trip.startKm), endKm: text(trip.endKm),
      distance: text(Math.round(distance * 1000) / 1000),
      expense: `${Number(trip.expense).toLocaleString("ko-KR")}원`,
      expenseDetail: text(trip.expenseDetail), note: text(trip.note),
    };
  });
  return {
    trips: formattedTrips,
    maintenance: maintenance.map((item) => ({
      id: text(item.id), date: text(item.date), mileage: text(item.mileage), item: text(item.item), otherItem: text(item.otherItem),
      detail: text(item.detail), vendor: text(item.vendor), cost: `${Number(item.cost).toLocaleString("ko-KR")}원`,
      nextMileage: text(item.nextMileage), note: text(item.note), nextDate: text(item.nextDate), receiptUrl: text(item.receiptUrl),
    })),
    summary: {
      totalDistance: totalDistance.toLocaleString("ko-KR", { maximumFractionDigits: 3 }),
      businessDistance: businessDistance.toLocaleString("ko-KR", { maximumFractionDigits: 3 }),
      businessRatio: `${totalDistance ? (businessDistance / totalDistance * 100).toFixed(1) : "0"}%`,
      totalExpense: `${totalExpense.toLocaleString("ko-KR")}원`, tripCount: String(trips.length),
    },
  };
}

export function tripLocations(trip: Record<string, unknown>) {
  const departure = String(trip.departure ?? "");
  const destination = String(trip.destination ?? "");
  if (departure || destination) return { departure, destination, route: [departure, destination].filter(Boolean).join(" → ") };
  const route = String(trip.route ?? "");
  // Preserve older combined route text if it has no clear separator.
  const parts = route.split(/\s*(?:→|->|\s-\s)\s*/);
  return parts.length === 2 ? { departure: parts[0], destination: parts[1], route } : { departure: route, destination: "", route };
}
