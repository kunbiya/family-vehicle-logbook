import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const directory = await mkdtemp(path.join(tmpdir(), "maintenance-form-"));
globalThis.familyPageEnv = { FAMILY_PASSWORD: "test-page-password", FAMILY_SESSION_SECRET: "test-page-secret-0123456789abcdef" };
globalThis.familyPageToken = undefined;
try {
  const result = await build({
    entryPoints: [path.join(root, "app/page.tsx")], bundle: true, write: false,
    platform: "node", format: "esm", tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "render-form", setup(builder) {
      builder.onResolve({ filter: /^(react(?:\/.*)?|lucide-react)$/ }, (args) => ({ path: require.resolve(args.path), external: true }));
      builder.onResolve({ filter: /^(cloudflare:workers|next\/headers)$/ }, (args) => ({ path: args.path, namespace: "host" }));
      builder.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({ contents: args.path === "cloudflare:workers"
        ? "export const env = globalThis.familyPageEnv;"
        : "export async function cookies() { return { get() { return globalThis.familyPageToken ? { value: globalThis.familyPageToken } : undefined; } }; }", loader: "js" }));
      builder.onLoad({ filter: /app\/page\.tsx$/ }, async (args) => ({
        contents: await readFile(args.path, "utf8") + '\nexport { VehicleDashboard, MaintenanceModal, MaintenanceTable, MaintenanceDetail, MaintenanceDeleteDialog, SettingsModal, MaintenanceItemsModal, MaintenanceList, TripModal, TripTable, TripDetail, TripDeleteDialog, LocationField } from "./vehicle-dashboard"; export { createFamilySession, verifyFamilySession } from "../lib/family-auth"; export { BusyOverlay, BusyProvider } from "./busy-layer"; export { BusyOperations } from "../lib/busy-operations";', loader: "tsx", resolveDir: path.dirname(args.path),
      }));
      builder.onLoad({ filter: /vehicle-dashboard\.tsx$/ }, async (args) => ({
        contents: await readFile(args.path, "utf8") + "\nexport { MaintenanceModal, MaintenanceTable, MaintenanceDetail, MaintenanceDeleteDialog, SettingsModal, MaintenanceItemsModal, MaintenanceList, TripModal, TripTable, TripDetail, TripDeleteDialog, LocationField };", loader: "tsx", resolveDir: path.dirname(args.path),
      }));
    } }],
  });
  const destination = path.join(directory, "form.mjs");
  await writeFile(destination, result.outputFiles[0].text);
  const { MaintenanceModal, MaintenanceTable, MaintenanceDetail, MaintenanceDeleteDialog, SettingsModal, MaintenanceItemsModal, MaintenanceList, TripModal, TripTable, TripDetail, TripDeleteDialog, LocationField, BusyOverlay, BusyProvider, BusyOperations, VehicleDashboard, default: Home, createFamilySession, verifyFamilySession } = await import(pathToFileURL(destination).href);
  const publicPage = renderToStaticMarkup(await Home());
  assert.ok(publicPage.includes('type="password"'));
  assert.ok(publicPage.includes("가족 공용 비밀번호를 입력해 주세요."));
  assert.ok(!publicPage.includes("대시보드"));
  assert.ok(!publicPage.includes("ChatGPT 계정"));
  const activeSession = await createFamilySession();
  globalThis.familyPageToken = activeSession.token;
  const privatePage = renderToStaticMarkup(await Home());
  assert.ok(privatePage.includes("대시보드"));
  globalThis.familyPageToken = activeSession.token + "tampered";
  assert.ok(renderToStaticMarkup(await Home()).includes('type="password"'));
  const expiredSession = await createFamilySession(Date.now() - 8 * 24 * 60 * 60 * 1000);
  assert.equal(await verifyFamilySession(expiredSession.token), null);
  globalThis.familyPageEnv.FAMILY_PASSWORD = "";
  globalThis.familyPageToken = undefined;
  const unconfigured = renderToStaticMarkup(await Home());
  assert.ok(unconfigured.includes("환경변수 설정이 필요합니다."));
  assert.ok(unconfigured.includes('disabled=""'));
  const counts = [];
  const operations = new BusyOperations((count) => counts.push(count));
  const endSave = operations.begin();
  assert.equal(counts.at(-1), 1);
  const endRefresh = operations.begin();
  endSave();
  assert.equal(counts.at(-1), 1);
  endSave();
  assert.equal(counts.at(-1), 1);
  endRefresh();
  assert.equal(counts.at(-1), 0);
  const endFailure = operations.begin();
  await assert.rejects(async () => { try { throw new Error("network failure"); } finally { endFailure(); } });
  assert.equal(counts.at(-1), 0);
  assert.ok(counts.every((count) => count >= 0));
  const overlay = renderToStaticMarkup(createElement(BusyOverlay));
  assert.ok(overlay.includes('role="dialog"'));
  assert.ok(overlay.includes('aria-modal="true"'));
  assert.ok(overlay.includes('class="busy-spinner"'));
  assert.ok(overlay.indexOf("로딩중") < overlay.indexOf("불러오는 중입니다. 잠시만 기다려주세요."));
  const idleProvider = renderToStaticMarkup(createElement(BusyProvider, {}, createElement("button", {}, "대시보드")));
  assert.ok(idleProvider.includes('aria-busy="false"'));
  assert.ok(!idleProvider.includes('class="busy-layer"'));
  const signInPath = "/";
  const signOutPath = "/api/family/logout";
  const loggedOut = renderToStaticMarkup(createElement(VehicleDashboard, { userName: null, signInPath, signOutPath }));
  const header = loggedOut.match(/<header class="topbar">(.*?)<\/header>/s)[1];
  assert.ok(header.includes(`href="${signInPath}"`));
  assert.ok(header.includes('target="_top"'));
  assert.ok(header.includes(">비밀번호 입력</a>"));
  assert.ok(loggedOut.includes("공용 비밀번호 입력"));
  const loggedIn = renderToStaticMarkup(createElement(VehicleDashboard, { userName: "가족 사용자", signInPath, signOutPath }));
  const sidebar = loggedIn.match(/<aside[^>]*>([\s\S]*?)<\/aside>/)[1];
  const vehiclePanel = loggedIn.match(/<section class="vehicle-hero">([\s\S]*?)<\/section>/)[1];
  assert.ok(!sidebar.includes("차량 설정"));
  assert.ok(vehiclePanel.includes("차량 정보"));
  assert.ok(vehiclePanel.includes("차량 설정"));
  assert.ok(!vehiclePanel.includes("PRIMARY VEHICLE"));
  assert.ok(loggedIn.includes(`action="${signOutPath}"`));
  assert.ok(loggedIn.includes('method="POST"'));
  assert.ok(!loggedIn.includes("공용 비밀번호 입력</a>"));
  const render = (items, loadError) => renderToStaticMarkup(createElement(MaintenanceModal, {
    items, latestMileage: 0, onClose() {}, async onSaved() {}, signInPath: "/", loadError,
  }));
  const unavailable = render([]);
  const options = [...unavailable.matchAll(/<option[^>]*>(.*?)<\/option>/g)].map((match) => match[1]);
  assert.deepEqual(options, ["항목 선택", "엔진오일", "에어컨필터", "에어필터", "타이어", "브레이크패드", "브레이크액", "배터리", "냉각수", "미션오일", "와이퍼", "정기검사", "기타 정비"]);
  const required = [...unavailable.matchAll(/<(?:input|select)[^>]*>/g)].map((match) => match[0])
    .filter((tag) => /\brequired=/.test(tag)).map((tag) => tag.match(/name="([^"]+)"/)[1]);
  assert.deepEqual(required, ["date", "item"]);
  const failed = render([], { status: "authentication_required", message: "로그인이 필요합니다." });
  assert.ok(failed.includes("기타 정비"));
  assert.ok(failed.includes("로그인이 필요합니다."));
  assert.ok(failed.includes('target="_top"'));
  assert.ok(failed.includes("비밀번호 입력"));
  const customized = render(["타이어", "가족 맞춤 점검"]);
  assert.ok(customized.includes("가족 맞춤 점검"));
  const record = { id: "11111111-1111-4111-8111-111111111111", date: "2026-10-12", item: "기타 정비", otherItem: "헤드램프 교체", mileage: "12000", detail: "긴 정비 상세 내용", vendor: "가족 정비소", cost: "50,000원", nextMileage: "15000", nextDate: "2027-01-01", receiptUrl: "https://example.test/receipt", note: "가족 공유 메모 <script>alert(1)</script>" };
  const list = renderToStaticMarkup(createElement(MaintenanceTable, { records: [record], onOpen() {}, onDelete() {}, onEdit() {} }));
  assert.ok(list.includes("maintenance-desktop"));
  assert.ok(list.includes("maintenance-mobile"));
  assert.ok(list.includes('class="maintenance-card"'));
  assert.ok(list.includes("2026-10-12 기타 정비 · 헤드램프 교체 상세조회"));
  assert.ok(list.includes("2026-10-12 기타 정비 · 헤드램프 교체 삭제"));
  assert.ok(list.includes("2026-10-12 기타 정비 · 헤드램프 교체 수정하기"));
  const desktop = list.split('class="maintenance-mobile"')[0];
  const headers = [...desktop.matchAll(/<th(?:\s[^>]*)?>(.*?)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(headers, ["정비항목 · 기타내용", "정비비용", "업체명", "다음교체", "관리"]);
  assert.ok(desktop.indexOf("상세보기</button>") < desktop.indexOf("수정하기</button>"));
  assert.ok(desktop.indexOf("수정하기</button>") < desktop.indexOf("삭제</button>"));
  const detail = renderToStaticMarkup(createElement(MaintenanceDetail, { record, onClose() {}, onDelete() {}, onEdit() {} }));
  assert.ok(detail.includes("수정하기"));
  for (const value of ["정비 기록 상세", "헤드램프 교체", "가족 정비소", "12", "15000 km", "2027-01-01", "가족 공유 메모", "정비 기록 삭제"]) assert.ok(detail.includes(value));
  assert.ok(detail.includes('href="https://example.test/receipt"'));
  assert.ok(!detail.includes("<script>alert(1)</script>"));
  const confirmation = renderToStaticMarkup(createElement(MaintenanceDeleteDialog, { record, onClose() {}, async onDeleted() {}, signInPath: "/" }));
  assert.ok(confirmation.includes("정비 기록을 삭제할까요?"));
  assert.ok(confirmation.includes("헤드램프 교체"));
  assert.ok(confirmation.includes("취소"));
  assert.ok(confirmation.includes("삭제하기"));
  const editForm = renderToStaticMarkup(createElement(MaintenanceModal, { record, items: ["타이어"], latestMileage: 0, onClose() {}, async onSaved() {}, signInPath: "/" }));
  assert.ok(editForm.includes("정비 기록 수정"));
  assert.ok(editForm.includes("수정사항 저장"));
  for (const value of ["12000", "50000", "2026-10-12", "15000", "2027-01-01", "헤드램프 교체", "가족 정비소"]) assert.ok(editForm.includes(`value="${value}"`));
  assert.ok(editForm.includes('selected=""'));
  assert.ok(editForm.includes("가족 공유 메모"));
  const settingsData = { profile: { model: "쏘나타", plate: "123가4567", mileage: "12000" }, maintenanceItems: ["엔진오일", "기타 정비"] };
  const vehicleForm = renderToStaticMarkup(createElement(SettingsModal, { data: settingsData, onClose() {}, async onSaved() {}, signInPath: "/" }));
  const inputNames = [...vehicleForm.matchAll(/<input[^>]*name="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(inputNames, ["model", "plate", "mileage"]);
  assert.ok(vehicleForm.includes('value="12000"'));
  assert.ok(!vehicleForm.includes("소유자"));
  assert.ok(!vehicleForm.includes('name="maintenanceItems"'));
  const catalogForm = renderToStaticMarkup(createElement(MaintenanceItemsModal, { items: settingsData.maintenanceItems, onClose() {}, async onSaved() {}, signInPath: "/" }));
  assert.ok(catalogForm.includes("정비 항목 관리"));
  assert.ok(catalogForm.includes('name="maintenanceItems"'));
  assert.ok(catalogForm.includes("엔진오일"));
  const maintenancePage = renderToStaticMarkup(createElement(MaintenanceList, { records: [], query: "", setQuery() {}, loading: false, onAdd() {}, onOpen() {}, onDelete() {}, onEdit() {}, onManageItems() {}, itemsDisabled: false }));
  assert.ok(maintenancePage.includes("항목 관리</button>"));
  const tripRecord = { id: "22222222-2222-4222-8222-222222222222", date: "2026-10-12", departure: "집", destination: "회사", route: "집 → 회사", startKm: "1000", endKm: "1040", distance: "40", expense: "3,000원", expenseDetail: "통행료", note: "여행 메모" };
  const tripForm = renderToStaticMarkup(createElement(TripModal, { record: tripRecord, onClose() {}, async onSaved() {}, signInPath: "/" }));
  assert.ok(tripForm.includes("운행 기록 수정"));
  assert.ok(tripForm.includes('name="departure"'));
  assert.ok(tripForm.includes('name="destination"'));
  assert.equal((tripForm.match(/>집으로<\/button>/g) || []).length, 2);
  for (const removed of ["운전자", "운행 목적", "업무 구분", 'name="driver"', 'name="purpose"', 'name="type"']) assert.ok(!tripForm.includes(removed));
  for (const value of ["집", "회사", "1000", "1040", "3000"]) assert.ok(tripForm.includes(`value="${value}"`));
  assert.ok(tripForm.includes("form-grid trip-form-grid"));
  for (const name of ["departure", "destination"]) {
    let value = "회사";
    const field = LocationField({ name, label: name === "departure" ? "출발지" : "목적지", value, onChange(next) { value = next; } });
    const homeButton = field.props.children[1].props.children[1];
    assert.equal(homeButton.props.type, "button");
    homeButton.props.onClick();
    assert.equal(value, "집");
  }
  const tripList = renderToStaticMarkup(createElement(TripTable, { trips: [tripRecord], onOpen() {}, onEdit() {}, onDelete() {} }));
  for (const text of ["출발지", "목적지", "수정하기", "삭제", "상세보기"]) assert.ok(tripList.includes(text));
  assert.ok(!tripList.includes("운전자"));
  assert.ok(!tripList.includes("업무"));
  const tripDetail = renderToStaticMarkup(createElement(TripDetail, { record: tripRecord, onClose() {}, onEdit() {}, onDelete() {} }));
  for (const text of ["주행 전 계기판", "주행 후 계기판", "여행 메모", "통행료", "운행 기록 삭제", "수정하기"]) assert.ok(tripDetail.includes(text));
  const tripDelete = renderToStaticMarkup(createElement(TripDeleteDialog, { record: tripRecord, onClose() {}, async onDeleted() {}, signInPath: "/" }));
  assert.ok(tripDelete.includes("운행 기록을 삭제할까요?"));
  assert.ok(tripDelete.includes("취소"));
  assert.ok(tripDelete.includes("삭제하기"));
  console.log("PASS: vehicle settings show only model/plate/mileage, catalog remains separately editable, edit forms preserve stored values, desktop column/action order, mobile edit/detail actions, protected gate, maintenance fields, safe text, and deletion confirmation.");
} finally {
  await rm(directory, { recursive: true, force: true });
  delete globalThis.familyPageEnv;
  delete globalThis.familyPageToken;
}
