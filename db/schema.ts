import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const submissionKeys = sqliteTable("submission_keys", {
  submissionKey: text("submission_key").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  createdBy: text("created_by").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  date: text("date").notNull(),
  driver: text("driver").notNull(),
  route: text("route").notNull(),
  departure: text("departure").notNull().default(""),
  destination: text("destination").notNull().default(""),
  purpose: text("purpose").notNull(),
  startKm: real("start_km").notNull(),
  endKm: real("end_km").notNull(),
  type: text("type").notNull(),
  expense: integer("expense").notNull(),
  expenseDetail: text("expense_detail").notNull(),
  note: text("note").notNull(),
}, (table) => [index("trips_date_idx").on(table.date, table.createdAt)]);

export const maintenance = sqliteTable("maintenance", {
  id: text("id").primaryKey(),
  createdBy: text("created_by").notNull(),
  payloadHash: text("payload_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  date: text("date").notNull(),
  mileage: real("mileage").notNull(),
  item: text("item").notNull(),
  otherItem: text("other_item").notNull().default(""),
  detail: text("detail").notNull(),
  vendor: text("vendor").notNull(),
  cost: integer("cost").notNull(),
  nextMileage: real("next_mileage"),
  note: text("note").notNull(),
  nextDate: text("next_date").notNull(),
  receiptUrl: text("receipt_url").notNull(),
}, (table) => [index("maintenance_date_idx").on(table.date, table.createdAt)]);

export const vehicleSettings = sqliteTable("vehicle_settings", {
  id: text("id").primaryKey(),
  model: text("model").notNull(),
  plate: text("plate").notNull(),
  owner: text("owner").notNull(),
  maintenanceItems: text("maintenance_items").notNull(),
  updatedAt: integer("updated_at").notNull(),
  mileage: real("mileage").notNull().default(0),
});

export const familyLoginAttempts = sqliteTable("family_login_attempts", {
  id: text("id").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStart: integer("window_start").notNull(),
});
