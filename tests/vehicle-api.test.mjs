import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Execute the real API handlers and generated migrations against SQLite.
// Only runtime environment variables and the D1 transport adapter are substituted.
const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(tmpdir(), "vehicle-api-"));
const sqlite = new DatabaseSync(":memory:");
for (const file of (await readdir(path.join(root, "drizzle"))).filter((name) => name.endsWith(".sql")).sort()) {
  sqlite.exec(await readFile(path.join(root, "drizzle", file), "utf8"));
}
const adapter = {
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
      async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return statement;
  },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try { const result = await Promise.all(statements.map((statement) => statement.all())); sqlite.exec("COMMIT"); return result; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
const passwordFixture = "test-only-family-password";
globalThis.vehicleTestEnv = { DB: adapter, FAMILY_PASSWORD: passwordFixture, FAMILY_SESSION_SECRET: "test-only-session-key-0123456789abcdef" };
const sessions = {};
let currentCookie = "";
const setUser = (id) => { currentCookie = sessions[id] ?? ""; };
const routes = {};
try {
  for (const name of ["records/read", "records/write", "vehicle/settings", "family/login", "family/logout", "maintenance/delete", "maintenance/update", "maintenance/items", "trips/update", "trips/delete"]) {
    const result = await build({
      entryPoints: [path.join(root, "app/api", name, "route.ts")], bundle: true, write: false,
      platform: "node", format: "esm", tsconfig: path.join(root, "tsconfig.json"),
      plugins: [{ name: "test-host", setup(builder) {
        builder.onResolve({ filter: /^(cloudflare:workers|next\/headers)$/ }, (args) => ({ path: args.path, namespace: "host" }));
        builder.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({ contents: args.path === "cloudflare:workers"
          ? "export const env = globalThis.vehicleTestEnv;"
          : "export async function headers() { return globalThis.vehicleTestHeaders; }", loader: "js" }));
      } }],
    });
    const destination = path.join(directory, name.replaceAll("/", "-") + ".mjs");
    await writeFile(destination, result.outputFiles[0].text);
    routes[name] = (await import(pathToFileURL(destination).href)).POST;
  }
  const call = async (name, payload = {}, origin = "https://vehicle.test", extraHeaders = {}) => {
    const response = await routes[name](new Request("https://vehicle.test/api/" + name, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: currentCookie, ...extraHeaders }, body: JSON.stringify(payload),
    }));
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.text();
    return { code: response.status, cookie: response.headers.get("set-cookie"), location: response.headers.get("location"), ...(body ? JSON.parse(body) : {}) };
  };
  const trip = {
    kind: "trip", submissionKey: crypto.randomUUID(), date: "2026-10-12", departure: "집",
    destination: "회사", startKm: "1000", endKm: "1040",
    expense: "3000", expenseDetail: "통행료", note: "'); DROP TABLE trips; --",
  };
  const maintenance = {
    kind: "maintenance", submissionKey: crypto.randomUUID(), date: "2026-10-10", mileage: 1100,
    item: "엔진오일", detail: "오일 교체", vendor: "정비소", cost: 90000, nextMileage: "", nextDate: "2027-04-10", receiptUrl: "",
  };

  assert.equal((await call("records/read", {}, "https://other.test")).code, 403);
  setUser(null);
  for (const name of ["records/read", "records/write", "vehicle/settings", "maintenance/delete", "maintenance/update", "maintenance/items", "trips/update", "trips/delete"]) assert.equal((await call(name, trip)).code, 401);
  assert.equal((await call("records/read", {}, "https://vehicle.test", { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "owner@example.test" })).code, 401);
  assert.equal((await call("family/login", { password: "wrong-password" })).code, 401);
  assert.equal((await call("family/login", { password: passwordFixture }, "https://other.test")).code, 403);
  for (const name of ["owner", "family"]) {
    const login = await call("family/login", { password: passwordFixture });
    assert.equal(login.code, 200);
    assert.ok(login.cookie.includes("HttpOnly; Secure; SameSite=Lax"));
    assert.ok(login.cookie.includes("Max-Age=604800"));
    assert.ok(!login.cookie.includes(passwordFixture));
    sessions[name] = login.cookie.split(";")[0];
  }
  setUser("owner");
  const empty = await call("records/read");
  assert.equal(empty.status, "success");
  assert.equal(empty.data.summary.tripCount, "0");
  assert.ok(empty.data.maintenanceItems.includes("엔진오일"));
  assert.deepEqual(empty.data.maintenanceItems, ["엔진오일", "에어컨필터", "에어필터", "타이어", "브레이크패드", "브레이크액", "배터리", "냉각수", "미션오일", "와이퍼", "정기검사", "기타 정비"]);
  sqlite.prepare("INSERT INTO vehicle_settings (id, model, plate, owner, maintenance_items, updated_at) VALUES ('primary', '기존 차량', '', '', ?, 0)").run(JSON.stringify(["사용자 정비", "브레이크 패드", "기타"]));
  const legacy = await call("records/read");
  assert.equal(legacy.data.profile.model, "기존 차량");
  assert.ok(legacy.data.maintenanceItems.includes("사용자 정비"));
  assert.ok(legacy.data.maintenanceItems.includes("정기검사"));
  assert.equal(legacy.data.maintenanceItems.filter((item) => item === "기타 정비").length, 1);

  for (const invalid of [
    { ...trip, endKm: 999 }, { ...trip, date: "2026-02-30" }, { ...trip, startKm: "" },
    { ...trip, expense: -1 }, { ...trip, departure: "" }, { ...trip, destination: "" },
  ]) assert.equal((await call("records/write", invalid)).code, 400);
  const concurrent = await Promise.all([call("records/write", trip), call("records/write", trip)]);
  for (const result of concurrent) assert.equal(result.status, "success");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM trips").get().count, 1);
  let tripRead = (await call("records/read")).data.trips[0];
  assert.equal(tripRead.departure, "집");
  assert.equal(tripRead.destination, "회사");
  for (const removed of ["driver", "purpose", "type"]) assert.ok(!(removed in tripRead));
  sqlite.prepare("UPDATE trips SET departure = '', destination = '', route = '집 - 회사' WHERE id = ?").run(trip.submissionKey);
  tripRead = (await call("records/read")).data.trips[0];
  assert.equal(tripRead.departure, "집");
  assert.equal(tripRead.destination, "회사");
  sqlite.prepare("UPDATE trips SET route = '구분자가 없는 기존 경로' WHERE id = ?").run(trip.submissionKey);
  tripRead = (await call("records/read")).data.trips[0];
  assert.equal(tripRead.departure, "구분자가 없는 기존 경로");
  assert.equal(tripRead.destination, "");
  sqlite.prepare("UPDATE trips SET departure = '집', destination = '회사', route = '집 → 회사' WHERE id = ?").run(trip.submissionKey);
  assert.equal((await call("records/write", { ...trip, expense: 4000 })).code, 409);
  assert.equal((await call("records/write", maintenance)).status, "success");
  assert.equal((await call("records/write", maintenance)).status, "success");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM maintenance").get().count, 1);
  assert.equal((await call("records/write", { ...maintenance, submissionKey: crypto.randomUUID(), receiptUrl: "javascript:alert(1)" })).code, 400);

  const settings = { model: "쏘나타", plate: "123가4567", mileage: 12000 };
  const itemSettings = { maintenanceItems: ["타이어", "정기점검", "타이어"] };
  assert.equal((await call("vehicle/settings", settings)).status, "success");
  assert.equal((await call("vehicle/settings", { ...settings, mileage: -1 })).code, 400);
  const vehicleSaved = await call("records/read");
  assert.equal(vehicleSaved.data.profile.mileage, "12000");
  assert.equal(vehicleSaved.data.profile.plate, "123가4567");
  assert.ok(!("owner" in vehicleSaved.data.profile));
  assert.ok(vehicleSaved.data.maintenanceItems.includes("사용자 정비"));
  assert.equal((await call("maintenance/items", itemSettings)).status, "success");
  assert.equal((await call("maintenance/items", { maintenanceItems: [] })).code, 400);
  assert.equal((await call("maintenance/items", itemSettings, "https://other.test")).code, 403);
  const catalogSaved = await call("records/read");
  assert.equal(catalogSaved.data.profile.model, settings.model);
  assert.equal(catalogSaved.data.profile.mileage, "12000");
  assert.equal((await call("vehicle/settings", settings)).status, "success");
  assert.deepEqual((await call("records/read")).data.maintenanceItems, ["타이어", "정기점검"]);
  assert.equal((await call("records/write", { ...maintenance, submissionKey: crypto.randomUUID() })).code, 400);
  // Retrying a saved record still succeeds after its item is removed from settings.
  assert.equal((await call("records/write", maintenance)).status, "success");
  assert.equal((await call("records/write", { ...maintenance, submissionKey: crypto.randomUUID(), item: "정기점검" })).status, "success");
  setUser("family");
  assert.equal((await call("records/write", trip)).code, 409);
  const personal = { ...trip, submissionKey: crypto.randomUUID(), startKm: 1040, endKm: 1050, expense: 2000, date: "2026-10-11" };
  assert.equal((await call("records/write", personal)).status, "success");
  const refreshed = await call("records/read");
  assert.equal(refreshed.data.profile.model, "쏘나타");
  assert.deepEqual(refreshed.data.maintenanceItems, ["타이어", "정기점검"]);
  assert.deepEqual(refreshed.data.summary, {
    totalDistance: "50", businessDistance: "0", businessRatio: "0.0%", totalExpense: "5,000원", tripCount: "2",
  });
  assert.equal(refreshed.data.trips[0].date, "2026-10-11");
  assert.equal(refreshed.data.trips[1].note, trip.note);
  assert.equal(refreshed.data.maintenance[0].nextMileage, "");
  assert.equal(refreshed.data.maintenance[0].cost, "90,000원");
  assert.equal(refreshed.data.maintenance.length, 2);
  const minimal = { kind: "maintenance", submissionKey: crypto.randomUUID(), date: "2026-10-12", item: "타이어" };
  assert.equal((await call("records/write", minimal)).status, "success");
  assert.equal((await call("records/write", { ...minimal, submissionKey: crypto.randomUUID(), date: "" })).code, 400);
  assert.equal((await call("records/write", { ...minimal, submissionKey: crypto.randomUUID(), item: "" })).code, 400);
  assert.equal((await call("records/write", { ...minimal, submissionKey: crypto.randomUUID(), mileage: "", cost: "", detail: "", vendor: "", nextMileage: "", note: "", nextDate: "", receiptUrl: "" })).status, "success");
  assert.equal((await call("records/write", { ...minimal, submissionKey: crypto.randomUUID(), cost: -1 })).code, 400);
  assert.equal((await call("maintenance/items", { maintenanceItems: ["타이어", "기타 정비"] })).status, "success");
  const other = { ...minimal, submissionKey: crypto.randomUUID(), item: "기타 정비", otherItem: "헤드램프 교체" };
  assert.equal((await call("records/write", other)).status, "success");
  assert.equal((await call("records/write", other)).status, "success");
  assert.equal((await call("records/write", { ...other, submissionKey: crypto.randomUUID(), otherItem: "" })).status, "success");
  const updated = await call("records/read");
  const minimalRecord = updated.data.maintenance.find((item) => item.id === minimal.submissionKey);
  assert.equal(minimalRecord.detail, "");
  assert.equal(minimalRecord.cost, "0원");
  assert.equal(updated.data.maintenance.find((item) => item.id === other.submissionKey).otherItem, "헤드램프 교체");
  const edit = { id: other.submissionKey, date: "2026-09-01", item: "기타 정비", otherItem: "수정한 정비명", cost: "12345", mileage: "12500", vendor: "변경한 정비소", detail: "수정한 내용", note: "수정 메모", nextMileage: "20000", nextDate: "2027-05-01", receiptUrl: "https://example.test/new-receipt" };
  assert.equal((await call("maintenance/update", edit, "https://other.test")).code, 403);
  assert.equal((await call("maintenance/update", { ...edit, id: "invalid-id" })).code, 400);
  assert.equal((await call("maintenance/update", { ...edit, date: "" })).code, 400);
  assert.equal((await call("maintenance/update", { ...edit, item: "" })).code, 400);
  assert.equal((await call("maintenance/update", { ...edit, item: "등록되지 않은 항목" })).code, 400);
  const edited = await call("maintenance/update", edit);
  assert.equal(edited.status, "success");
  assert.equal(edited.record.id, other.submissionKey);
  assert.equal(edited.record.cost, "12,345원");
  assert.equal(edited.record.otherItem, "수정한 정비명");
  assert.equal(edited.record.nextDate, "2027-05-01");
  const editReload = await call("records/read");
  assert.equal(editReload.data.maintenance.length, updated.data.maintenance.length);
  assert.equal(editReload.data.maintenance[0].id, other.submissionKey);
  assert.equal(editReload.data.maintenance[0].vendor, "변경한 정비소");
  assert.equal(editReload.data.profile.mileage, "12500");
  assert.equal((await call("maintenance/update", edit)).status, "success");
  const minimalEdit = await call("maintenance/update", { id: other.submissionKey, date: "2026-09-01", item: "타이어", otherItem: "지워져야 할 내용" });
  assert.equal(minimalEdit.status, "success");
  assert.equal(minimalEdit.record.otherItem, "");
  assert.equal(minimalEdit.record.cost, "0원");
  assert.equal(minimalEdit.record.nextMileage, "");
  assert.equal(minimalEdit.record.receiptUrl, "");
  // Existing historical options can still be retained when editing other fields.
  assert.equal((await call("maintenance/update", { id: maintenance.submissionKey, date: maintenance.date, item: "엔진오일", cost: 45000 })).status, "success");
  assert.equal((await call("maintenance/update", { ...edit, id: crypto.randomUUID() })).code, 404);
  const beforeDeleteCount = updated.data.maintenance.length;
  assert.equal((await call("maintenance/delete", { id: other.submissionKey }, "https://other.test")).code, 403);
  assert.equal((await call("maintenance/delete", { id: "invalid-id' OR 1=1 --" })).code, 400);
  const deleted = await call("maintenance/delete", { id: other.submissionKey });
  assert.equal(deleted.status, "success");
  assert.equal(deleted.deleted, true);
  const afterDelete = await call("records/read");
  assert.equal(afterDelete.data.maintenance.length, beforeDeleteCount - 1);
  assert.ok(!afterDelete.data.maintenance.some((item) => item.id === other.submissionKey));
  assert.ok(afterDelete.data.maintenance.some((item) => item.id === maintenance.submissionKey));
  assert.equal(afterDelete.data.trips.length, 2);
  assert.equal((await call("maintenance/delete", { id: other.submissionKey })).deleted, false);
  assert.equal((await call("maintenance/update", edit)).code, 404);
  assert.equal((await call("maintenance/delete", { id: crypto.randomUUID() })).deleted, false);
  const tripEdit = { id: trip.submissionKey, date: "2026-10-13", departure: "회사", destination: "집", startKm: 1000, endKm: 1090, note: "운행 수정 메모" };
  assert.equal((await call("trips/update", tripEdit, "https://other.test")).code, 403);
  assert.equal((await call("trips/update", { ...tripEdit, id: "invalid" })).code, 400);
  assert.equal((await call("trips/update", { ...tripEdit, endKm: 999 })).code, 400);
  assert.equal((await call("trips/update", { ...tripEdit, destination: "" })).code, 400);
  const tripUpdated = await call("trips/update", tripEdit);
  assert.equal(tripUpdated.status, "success");
  assert.equal(tripUpdated.record.route, "회사 → 집");
  assert.equal(tripUpdated.record.distance, "90");
  assert.equal(tripUpdated.record.expense, "0원");
  assert.equal((await call("trips/update", tripEdit)).status, "success");
  const tripRefreshed = await call("records/read");
  assert.equal(tripRefreshed.data.trips.length, 2);
  assert.equal(tripRefreshed.data.summary.totalDistance, "100");
  assert.equal(tripRefreshed.data.summary.totalExpense, "2,000원");
  assert.equal(tripRefreshed.data.trips[1].note, "운행 수정 메모");
  assert.equal((await call("trips/update", { ...tripEdit, id: crypto.randomUUID() })).code, 404);
  assert.equal((await call("trips/delete", { id: trip.submissionKey }, "https://other.test")).code, 403);
  assert.equal((await call("trips/delete", { id: "invalid" })).code, 400);
  assert.equal((await call("trips/delete", { id: trip.submissionKey })).deleted, true);
  assert.equal((await call("trips/delete", { id: trip.submissionKey })).deleted, false);
  assert.equal((await call("trips/update", tripEdit)).code, 404);
  const afterTripDelete = await call("records/read");
  assert.equal(afterTripDelete.data.trips.length, 1);
  assert.equal(afterTripDelete.data.summary.totalDistance, "10");
  assert.equal(afterTripDelete.data.summary.tripCount, "1");
  assert.equal(afterTripDelete.data.maintenance.length, afterDelete.data.maintenance.length);
  const validCookie = currentCookie;
  currentCookie = currentCookie.slice(0, -2) + "zz";
  assert.equal((await call("records/read")).code, 401);
  currentCookie = validCookie;
  globalThis.vehicleTestEnv.FAMILY_PASSWORD = "rotated-test-only-password";
  assert.equal((await call("records/read")).code, 401);
  globalThis.vehicleTestEnv.FAMILY_PASSWORD = passwordFixture;
  for (let i = 0; i < 10; i++) assert.equal((await call("family/login", { password: "wrong" }, "https://vehicle.test", { "cf-connecting-ip": "test-rate-limit" })).code, 401);
  assert.equal((await call("family/login", { password: passwordFixture }, "https://vehicle.test", { "cf-connecting-ip": "test-rate-limit" })).code, 429);
  for (const row of sqlite.prepare("SELECT * FROM family_login_attempts").all()) {
    assert.ok(!JSON.stringify(row).includes(passwordFixture));
    assert.deepEqual(Object.keys(row), ["id", "attempts", "window_start"]);
  }
  assert.equal((await call("family/logout", {}, "https://other.test")).code, 403);
  const logout = await call("family/logout");
  assert.equal(logout.code, 303);
  assert.equal(logout.location, "/");
  assert.ok(logout.cookie.includes("Max-Age=0"));
  currentCookie = "";
  assert.equal((await call("records/read")).code, 401);
  currentCookie = validCookie;
  globalThis.vehicleTestEnv.FAMILY_PASSWORD = "";
  assert.equal((await call("family/login", { password: passwordFixture })).code, 503);
  globalThis.vehicleTestEnv.FAMILY_PASSWORD = passwordFixture;
  const db = globalThis.vehicleTestEnv.DB;
  globalThis.vehicleTestEnv.DB = undefined;
  const originalConsole = console.error;
  console.error = () => {};
  try { assert.equal((await call("records/read")).code, 503); }
  finally { console.error = originalConsole; globalThis.vehicleTestEnv.DB = db; }
  console.log("PASS: authenticated record editing/reload, optional fields, historical options, missing records, single-record deletion/retries, shared-password sessions, SQLite migrations, validation, settings, totals, and failures.");
} finally {
  sqlite.close();
  await rm(directory, { recursive: true, force: true });
  delete globalThis.vehicleTestEnv;
  delete globalThis.vehicleTestHeaders;
}
