"use client";

import {
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  CarFront,
  CheckCircle2,
  CircleAlert,
  Gauge,
  Home as HomeIcon,
  Menu,
  Plus,
  Pencil,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MAINTENANCE_ITEMS } from "@/lib/maintenance-catalog";
import { useBusyOperation } from "./busy-layer";

type Trip = {
  id: string; date: string; departure: string; destination: string; route: string;
  startKm: string; endKm: string; distance: string; expense: string;
  expenseDetail: string; note: string;
};
type Maintenance = {
  id: string; date: string; mileage: string; item: string; otherItem: string; detail: string; vendor: string;
  cost: string; nextMileage: string; note: string; nextDate: string; receiptUrl: string;
};
type DashboardData = {
  profile: { model: string; plate: string; mileage: string };
  summary: { totalDistance: string; businessDistance: string; businessRatio: string; totalExpense: string; tripCount: string };
  trips: Trip[];
  maintenance: Maintenance[];
  maintenanceItems: string[];
  syncedAt: string;
};
type Tab = "dashboard" | "trips" | "maintenance";
type Modal = "trip" | "maintenance" | "settings" | "maintenance-items" | null;

const emptyData: DashboardData = {
  profile: { model: "", plate: "", mileage: "0" },
  summary: { totalDistance: "—", businessDistance: "—", businessRatio: "—", totalExpense: "—", tripCount: "—" },
  trips: [], maintenance: [], maintenanceItems: [...DEFAULT_MAINTENANCE_ITEMS], syncedAt: "",
};

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function numberOf(value: string) {
  return Number(value.replace(/[^0-9.-]/g, "")) || 0;
}

function won(value: string | number) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

function timeLabel(value: string) {
  if (!value) return "아직 불러오지 않음";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function StatusBadge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "amber" | "gray" }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof CarFront; title: string; body: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={22} /></div>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

export function VehicleDashboard({ userName, signInPath, signOutPath }: { userName: string | null; signInPath: string; signOutPath: string }) {
  const beginBusy = useBusyOperation();
  const [data, setData] = useState<DashboardData>(emptyData);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedMaintenance, setSelectedMaintenance] = useState<Maintenance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Maintenance | null>(null);
  const [editTarget, setEditTarget] = useState<Maintenance | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [editTripTarget, setEditTripTarget] = useState<Trip | null>(null);
  const [deleteTripTarget, setDeleteTripTarget] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: string; message: string } | null>(null);
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const needsSignIn = !userName || error?.status === "authentication_required";

  const loadData = useCallback(async () => {
    const stopBusy = beginBusy();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/records/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json() as { status: string; data: DashboardData; message?: string };
      if (result.status !== "success" || !result.data) throw result;
      setData({ ...result.data, maintenanceItems: result.data.maintenanceItems?.length ? result.data.maintenanceItems : [...DEFAULT_MAINTENANCE_ITEMS] });
    } catch (cause) {
      const failure = cause as { status?: string; message?: string };
      setError({ status: failure.status ?? "upstream_error", message: failure.message ?? "차량 기록을 불러오지 못했습니다." });
    } finally {
      setLoading(false);
      stopBusy();
    }
  }, [beginBusy]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const latestMileage = useMemo(() => Math.max(numberOf(data.profile.mileage), ...data.trips.map((trip) => numberOf(trip.endKm)), ...data.maintenance.map((item) => numberOf(item.mileage))), [data.profile.mileage, data.trips, data.maintenance]);
  const totalMaintenance = useMemo(() => data.maintenance.reduce((sum, item) => sum + numberOf(item.cost), 0), [data.maintenance]);
  const filteredTrips = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.trips;
    return data.trips.filter((item) => Object.values(item).some((value) => value.toLowerCase().includes(term)));
  }, [data.trips, query]);
  const filteredMaintenance = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.maintenance;
    return data.maintenance.filter((item) => Object.values(item).some((value) => value.toLowerCase().includes(term)));
  }, [data.maintenance, query]);


  const showTab = (next: Tab) => { setTab(next); setMobileNav(false); setQuery(""); };
  const syncAfterWrite = async (message: string) => { setModal(null); setToast(message); await loadData(); };
  const afterMaintenanceDelete = async (id: string) => {
    setData((current) => ({ ...current, maintenance: current.maintenance.filter((record) => record.id !== id) }));
    setSelectedMaintenance((current) => current?.id === id ? null : current);
    setDeleteTarget(null);
    setToast("정비 기록을 삭제했습니다.");
    await loadData();
  };
  const afterMaintenanceEdit = async (message: string, record?: Maintenance) => {
    if (record) {
      setData((current) => ({ ...current, maintenance: current.maintenance.map((item) => item.id === record.id ? record : item) }));
      setSelectedMaintenance((current) => current?.id === record.id ? record : current);
    }
    setEditTarget(null);
    setToast(message);
    await loadData();
  };

  const afterTripEdit = async (message: string, record?: Trip) => {
    if (record) {
      setData((current) => ({ ...current, trips: current.trips.map((item) => item.id === record.id ? record : item) }));
      setSelectedTrip((current) => current?.id === record.id ? record : current);
    }
    setEditTripTarget(null); setToast(message); await loadData();
  };
  const afterTripDelete = async (id: string) => {
    setData((current) => ({ ...current, trips: current.trips.filter((item) => item.id !== id) }));
    setSelectedTrip((current) => current?.id === id ? null : current);
    setDeleteTripTarget(null); setToast("운행 기록을 삭제했습니다."); await loadData();
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><CarFront size={22} /></div>
          <div><strong>DRIVELOG</strong><span>차량 관리 허브</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="메뉴 닫기"><X size={20} /></button>
        </div>
        <nav className="nav-list" aria-label="주요 메뉴">
          <NavButton active={tab === "dashboard"} icon={Gauge} label="대시보드" onClick={() => showTab("dashboard")} />
          <NavButton active={tab === "trips"} icon={Route} label="운행 기록" count={data.trips.length} onClick={() => showTab("trips")} />
          <NavButton active={tab === "maintenance"} icon={Wrench} label="정비 기록" count={data.maintenance.length} onClick={() => showTab("maintenance")} />
        </nav>
        <div className="sidebar-spacer" />

        <div className="sync-card">
          <div className="sync-row"><span className={`sync-dot ${error ? "error" : ""}`} />{error ? "불러오기 실패" : loading ? "기록 불러오는 중" : "기록 저장소 연결됨"}</div>
          <small>마지막 조회 · {timeLabel(data.syncedAt)}</small>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="메뉴 열기"><Menu size={21} /></button>
          <div className="topbar-title">
            <span>{data.profile.model || "내 차량"}</span>
            <StatusBadge tone="green"><ShieldCheck size={13} /> 가족 차량 기록</StatusBadge>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button" onClick={() => void loadData()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} /> 새로고침</button>
            {needsSignIn ? <a className="primary-button account-link" href={signInPath} target="_top">비밀번호 입력</a> : <>
              <form action={signOutPath} method="POST"><button type="submit" className="secondary-button account-link">접속 종료</button></form>
            </>}
          </div>
        </header>

        <div className="content-wrap">
          {needsSignIn && <div className="sign-in-notice" role="status">
            <ShieldCheck size={22} />
            <div><strong>접속 시간이 만료되었습니다</strong><p>공용 비밀번호를 다시 입력하면 기록을 조회하고 저장할 수 있습니다.</p></div>
            <a className="primary-button" href={signInPath} target="_top">공용 비밀번호 입력</a>
          </div>}
          {error && error.status !== "authentication_required" && (
            <div className="connection-alert" role="alert">
              <CircleAlert size={20} />
              <div><strong>차량 기록을 불러오지 못했습니다</strong><span>{error.message}</span></div>
              <button className="secondary-button" onClick={() => void loadData()}>다시 시도</button>
            </div>
          )}

          {tab === "dashboard" && (
            <DashboardView
              data={data}
              loading={loading}
              latestMileage={latestMileage}
              totalMaintenance={totalMaintenance}
              onAddTrip={() => setModal("trip")}
              onAddMaintenance={() => setModal("maintenance")}
              onSettings={() => setModal("settings")}
              settingsDisabled={loading || Boolean(error)}
            />
          )}
          {tab === "trips" && (
            <TripList trips={filteredTrips} query={query} setQuery={setQuery} loading={loading} onAdd={() => setModal("trip")} onOpen={setSelectedTrip} onEdit={setEditTripTarget} onDelete={setDeleteTripTarget} />
          )}
          {tab === "maintenance" && (
            <MaintenanceList records={filteredMaintenance} query={query} setQuery={setQuery} loading={loading} onAdd={() => setModal("maintenance")} onOpen={setSelectedMaintenance} onDelete={setDeleteTarget} onEdit={setEditTarget} onManageItems={() => setModal("maintenance-items")} itemsDisabled={loading || Boolean(error)} />
          )}
        </div>
      </main>

      {modal === "maintenance-items" && <MaintenanceItemsModal items={data.maintenanceItems} onClose={() => setModal(null)} onSaved={syncAfterWrite} signInPath={signInPath} />}
      {modal === "settings" && <SettingsModal data={data} onClose={() => setModal(null)} onSaved={syncAfterWrite} signInPath={signInPath} />}
      {editTripTarget && <TripModal record={editTripTarget} onClose={() => setEditTripTarget(null)} onSaved={afterTripEdit} signInPath={signInPath} />}
      {selectedTrip && !editTripTarget && !deleteTripTarget && <TripDetail record={selectedTrip} onClose={() => setSelectedTrip(null)} onEdit={() => setEditTripTarget(selectedTrip)} onDelete={() => setDeleteTripTarget(selectedTrip)} />}
      {deleteTripTarget && <TripDeleteDialog record={deleteTripTarget} onClose={() => setDeleteTripTarget(null)} onDeleted={afterTripDelete} signInPath={signInPath} />}
      {modal === "trip" && <TripModal onClose={() => setModal(null)} onSaved={syncAfterWrite} signInPath={signInPath} />}
      {modal === "maintenance" && <MaintenanceModal items={data.maintenanceItems} latestMileage={latestMileage} onClose={() => setModal(null)} onSaved={syncAfterWrite} signInPath={signInPath} loadError={error} />}
      {editTarget && <MaintenanceModal record={editTarget} items={data.maintenanceItems} latestMileage={latestMileage} onClose={() => setEditTarget(null)} onSaved={afterMaintenanceEdit} signInPath={signInPath} />}
      {selectedMaintenance && !deleteTarget && !editTarget && <MaintenanceDetail record={selectedMaintenance} onClose={() => setSelectedMaintenance(null)} onDelete={() => setDeleteTarget(selectedMaintenance)} onEdit={() => setEditTarget(selectedMaintenance)} />}
      {deleteTarget && <MaintenanceDeleteDialog record={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={afterMaintenanceDelete} signInPath={signInPath} />}
      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
      {mobileNav && <button className="nav-backdrop" aria-label="메뉴 닫기" onClick={() => setMobileNav(false)} />}
    </div>
  );
}

function NavButton({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: typeof Gauge; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={19} /><span>{label}</span>{count !== undefined && <em>{count}</em>}</button>;
}

function DashboardView({ data, loading, latestMileage, totalMaintenance, onAddTrip, onAddMaintenance, onSettings, settingsDisabled }: {
  data: DashboardData; loading: boolean; latestMileage: number; totalMaintenance: number;
  onAddTrip: () => void; onAddMaintenance: () => void; onSettings: () => void; settingsDisabled: boolean;
}) {
  return (
    <>
      <section className="page-heading">
        <div><span className="eyebrow">OVERVIEW</span><h1>차량 현황을 한눈에</h1><p>운행과 정비 기록을 한곳에 저장하고 관리합니다.</p></div>
        <div className="heading-actions"><button className="primary-button" onClick={onAddTrip}><Plus size={17} /> 운행 기록 추가</button><button className="secondary-button" onClick={onAddMaintenance}><Wrench size={16} /> 정비 기록</button></div>
      </section>

      <section className="vehicle-hero">
        <header className="vehicle-panel-header"><h2>차량 정보</h2><button type="button" className="vehicle-panel-settings" onClick={onSettings} disabled={settingsDisabled}><Settings2 size={16} />차량 설정</button></header>
        <div className="vehicle-visual"><div className="road-line" /><CarFront size={72} strokeWidth={1.25} /></div>
        <div className="vehicle-info">
          <h3>{data.profile.model || "차량 정보를 입력해 주세요"}</h3>
          <div className="vehicle-meta"><span>{data.profile.plate || "차량번호 미등록"}</span></div>
        </div>
        <div className="odometer"><span>현재 계기판</span><strong>{latestMileage ? latestMileage.toLocaleString("ko-KR") : "—"}<small> km</small></strong><em>차량 설정·운행·정비 기록 기준</em></div>
      </section>

      <section className="metric-grid">
        <Metric icon={Route} label="총 주행거리" value={data.summary.totalDistance} suffix="km" hint={`${data.summary.tripCount}건의 운행`} loading={loading} />
        <Metric icon={CalendarDays} label="총 운행 횟수" value={data.summary.tripCount} suffix="건" hint="저장된 운행 기록" loading={loading} />
        <Metric icon={ArrowDownToLine} label="운행 경비" value={data.summary.totalExpense} hint="저장된 운행 기록 합계" loading={loading} />
        <Metric icon={Wrench} label="누적 정비비" value={totalMaintenance ? won(totalMaintenance) : "0원"} hint={`${data.maintenance.length}건의 정비`} loading={loading} />
      </section>


    </>
  );
}

function Metric({ icon: Icon, label, value, suffix, hint, loading }: { icon: typeof Route; label: string; value: string; suffix?: string; hint: string; loading: boolean }) {
  return <div className="metric-card"><div className="metric-icon"><Icon size={20} /></div><span>{label}</span>{loading ? <div className="skeleton metric-skeleton" /> : <strong>{value}<small>{suffix ? ` ${suffix}` : ""}</small></strong>}<em>{hint}</em></div>;
}

function PanelHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="panel-header"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div>{action && <button className="text-button" onClick={onAction}>{action}<ArrowUpRight size={14} /></button>}</div>;
}

function TripList({ trips, query, setQuery, loading, onAdd, onOpen, onEdit, onDelete }: { trips: Trip[]; query: string; setQuery: (value: string) => void; loading: boolean; onAdd: () => void; onOpen: (record: Trip) => void; onEdit: (record: Trip) => void; onDelete: (record: Trip) => void }) {
  return <><ListHeading eyebrow="DRIVING LOG" title="운행 기록" description="저장된 운행 내역을 조회하고 새 기록을 추가합니다." query={query} setQuery={setQuery} onAdd={onAdd} addLabel="운행 기록 추가" /><section className="panel table-panel">{loading ? <TableSkeleton /> : <TripTable trips={[...trips].reverse()} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />}</section></>;
}

function MaintenanceList({ records, query, setQuery, loading, onAdd, onOpen, onDelete, onEdit, onManageItems, itemsDisabled }: { records: Maintenance[]; query: string; setQuery: (value: string) => void; loading: boolean; onAdd: () => void; onOpen: (record: Maintenance) => void; onDelete: (record: Maintenance) => void; onEdit: (record: Maintenance) => void; onManageItems: () => void; itemsDisabled: boolean }) {
  return <><ListHeading eyebrow="MAINTENANCE LOG" title="정비 기록" description="정비항목을 누르면 상세 내용을 확인할 수 있습니다." query={query} setQuery={setQuery} onAdd={onAdd} addLabel="정비 기록 추가" extraAction={<button type="button" className="record-action-button catalog-button" onClick={onManageItems} disabled={itemsDisabled}><Settings2 size={16} />항목 관리</button>} /><section className="panel table-panel maintenance-list-panel">{loading ? <TableSkeleton /> : <MaintenanceTable records={[...records].reverse()} onOpen={onOpen} onDelete={onDelete} onEdit={onEdit} />}</section></>;
}

function ListHeading({ eyebrow, title, description, query, setQuery, onAdd, addLabel, extraAction }: { eyebrow: string; title: string; description: string; query: string; setQuery: (value: string) => void; onAdd: () => void; addLabel: string; extraAction?: React.ReactNode }) {
  return <section className="page-heading list-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="heading-actions"><label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="기록 검색" /></label>{extraAction}<button className="primary-button" onClick={onAdd}><Plus size={17} />{addLabel}</button></div></section>;
}

function TripTable({ trips, compact = false, onOpen, onEdit, onDelete }: { trips: Trip[]; compact?: boolean; onOpen?: (record: Trip) => void; onEdit?: (record: Trip) => void; onDelete?: (record: Trip) => void }) {
  if (!trips.length) return <EmptyState icon={Route} title="표시할 운행 기록이 없습니다" body="새 기록을 추가하거나 검색어를 변경해 주세요." />;
  return <><div className="table-scroll maintenance-desktop trip-desktop"><table><thead><tr><th>운행일자</th><th>출발지</th><th>목적지</th><th className="numeric">주행거리</th>{!compact && <><th className="numeric">운행 경비</th><th>관리</th></>}</tr></thead><tbody>{trips.map((trip) => <tr key={trip.id}>
    <td>{trip.date}</td><td>{onOpen ? <button type="button" className="trip-route-button" onClick={() => onOpen(trip)}>{trip.departure || "—"}</button> : trip.departure || "—"}</td><td>{trip.destination || "—"}</td><td className="numeric"><strong>{trip.distance || "0"}</strong> km</td>
    {!compact && <><td className="numeric">{trip.expense || "0원"}</td><td><div className="maintenance-row-actions">{onOpen && <button type="button" className="record-action-button" onClick={() => onOpen(trip)}>상세보기</button>}{onEdit && <button type="button" className="record-action-button" onClick={() => onEdit(trip)}><Pencil size={14} />수정하기</button>}{onDelete && <button type="button" className="delete-record-button" onClick={() => onDelete(trip)}><Trash2 size={14} />삭제</button>}</div></td></>}
  </tr>)}</tbody></table></div>
  <div className="maintenance-mobile" aria-label="운행 기록 목록">{trips.map((trip) => <article className="maintenance-card" key={trip.id}><header><span className="maintenance-card-date">{trip.date}</span><strong className="trip-card-route">{trip.departure || "미입력"} → {trip.destination || "미입력"}</strong></header><dl className="maintenance-card-meta"><div><dt>주행거리</dt><dd>{trip.distance} km</dd></div>{!compact && <div><dt>운행 경비</dt><dd>{trip.expense || "0원"}</dd></div>}</dl>
    {!compact && <footer>{onOpen && <button type="button" className="text-button" onClick={() => onOpen(trip)}>상세보기</button>}{onEdit && <button type="button" className="record-action-button" onClick={() => onEdit(trip)}><Pencil size={15} />수정하기</button>}{onDelete && <button type="button" className="delete-record-button" onClick={() => onDelete(trip)}><Trash2 size={15} />삭제</button>}</footer>}
  </article>)}</div></>;
}

function TripDetail({ record, onClose, onEdit, onDelete }: { record: Trip; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const field = (label: string, value: string, wide = false) => <div className={`maintenance-detail-field ${wide ? "wide" : ""}`}><dt>{label}</dt><dd>{value || "미입력"}</dd></div>;
  return <ModalShell title="운행 기록 상세" subtitle={record.date} icon={Route} onClose={onClose}><div className="maintenance-detail-content"><dl className="maintenance-detail-grid">
    {field("운행일자", record.date, true)}{field("출발지", record.departure)}{field("목적지", record.destination)}{field("주행 전 계기판", `${record.startKm} km`)}{field("주행 후 계기판", `${record.endKm} km`)}{field("주행거리", `${record.distance} km`)}{field("운행 경비", record.expense)}{field("경비 내용", record.expenseDetail, true)}{field("비고", record.note, true)}
    </dl><footer className="modal-footer maintenance-detail-footer"><button type="button" className="primary-button" onClick={onEdit}><Pencil size={16} />수정하기</button><button type="button" className="danger-button" onClick={onDelete}><Trash2 size={16} />운행 기록 삭제</button><button type="button" className="secondary-button" onClick={onClose}>닫기</button></footer></div></ModalShell>;
}

function TripDeleteDialog({ record, onClose, onDeleted, signInPath }: { record: Trip; onClose: () => void; onDeleted: (id: string) => Promise<void>; signInPath: string }) {
  const beginBusy = useBusyOperation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<{ status?: string; message: string } | null>(null);
  const remove = async () => {
    if (deleting) return; setDeleting(true); setError(null);
    const stopBusy = beginBusy();
    try {
      const response = await fetch("/api/trips/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id }) });
      const result = await response.json() as { status: string; message?: string };
      if (result.status !== "success") throw result;
      await onDeleted(record.id);
    } catch (cause) { const failure = cause as { status?: string; message?: string }; setError({ status: failure.status, message: failure.message ?? "삭제하지 못했습니다. 다시 시도해 주세요." }); }
    finally { setDeleting(false); stopBusy(); }
  };
  return <ModalShell title="운행 기록을 삭제할까요?" subtitle="선택한 운행 기록 한 건만 삭제합니다." icon={Trash2} onClose={() => { if (!deleting) onClose(); }}><div className="maintenance-delete-content"><div className="maintenance-delete-summary"><span>{record.date}</span><strong>{record.departure} → {record.destination}</strong><span>{record.distance} km</span></div><p>삭제한 기록은 복구할 수 없습니다.</p>{error && <div className="form-error" role="alert"><CircleAlert size={17} /><span>{error.message}</span>{error.status === "authentication_required" && <a href={signInPath} target="_top">비밀번호 입력</a>}</div>}<footer className="modal-footer"><button type="button" className="secondary-button" onClick={onClose} disabled={deleting}>취소</button><button type="button" className="danger-button" onClick={() => void remove()} disabled={deleting}>{deleting ? "삭제 중" : "삭제하기"}</button></footer></div></ModalShell>;
}

function MaintenanceTable({ records, onOpen, onDelete, onEdit }: { records: Maintenance[]; onOpen: (record: Maintenance) => void; onDelete: (record: Maintenance) => void; onEdit: (record: Maintenance) => void }) {
  if (!records.length) return <EmptyState icon={Wrench} title="표시할 정비 기록이 없습니다" body="새 기록을 추가하거나 검색어를 변경해 주세요." />;
  return <>
    <div className="table-scroll maintenance-desktop"><table><colgroup><col className="maintenance-col-item" /><col className="maintenance-col-cost" /><col className="maintenance-col-vendor" /><col className="maintenance-col-next" /><col className="maintenance-col-actions" /></colgroup><thead><tr><th>정비항목 · 기타내용</th><th className="numeric">정비비용</th><th>업체명</th><th>다음교체</th><th>관리</th></tr></thead><tbody>{records.map((item) => <tr key={item.id}>
      <td><button type="button" className="maintenance-item-button" onClick={() => onOpen(item)} aria-label={`${item.date} ${maintenanceName(item)} 상세조회`}>{maintenanceName(item)}</button><span className="maintenance-row-date">{item.date}</span></td>
      <td className="numeric">{item.cost || "0원"}</td><td>{item.vendor || "미입력"}</td><td>{item.nextMileage && <span>{item.nextMileage} km</span>}{item.nextDate && <span className="maintenance-next-date">{item.nextDate}</span>}{!item.nextMileage && !item.nextDate && "미입력"}</td>
      <td><div className="maintenance-row-actions"><button type="button" className="record-action-button" onClick={() => onOpen(item)}>상세보기</button><button type="button" className="record-action-button" onClick={() => onEdit(item)} aria-label={`${item.date} ${maintenanceName(item)} 수정하기`}><Pencil size={14} />수정하기</button><button type="button" className="delete-record-button" onClick={() => onDelete(item)} aria-label={`${item.date} ${maintenanceName(item)} 삭제`}><Trash2 size={14} />삭제</button></div></td>
    </tr>)}</tbody></table></div>
    <div className="maintenance-mobile" aria-label="정비 기록 목록">{records.map((item) => <article className="maintenance-card" key={item.id}>
      <header><span className="maintenance-card-date">{item.date}</span><button type="button" className="maintenance-item-button" onClick={() => onOpen(item)} aria-label={`${item.date} ${maintenanceName(item)} 상세조회`}>{maintenanceName(item)}<ArrowUpRight size={16} /></button></header>
      {item.detail && <p className="maintenance-card-summary">{item.detail}</p>}
      <dl className="maintenance-card-meta"><div><dt>정비 비용</dt><dd>{item.cost || "0원"}</dd></div><div><dt>업체명</dt><dd>{item.vendor || "미입력"}</dd></div><div><dt>다음 교체</dt><dd>{[item.nextMileage ? `${item.nextMileage} km` : "", item.nextDate].filter(Boolean).join(" · ") || "미입력"}</dd></div></dl>
      <footer><button type="button" className="text-button" onClick={() => onOpen(item)}>상세조회<ArrowUpRight size={15} /></button><button type="button" className="record-action-button" onClick={() => onEdit(item)} aria-label={`${item.date} ${maintenanceName(item)} 수정하기`}><Pencil size={15} />수정하기</button><button type="button" className="delete-record-button" onClick={() => onDelete(item)} aria-label={`${item.date} ${maintenanceName(item)} 삭제`}><Trash2 size={15} />삭제</button></footer>
    </article>)}</div>
  </>;
}

function MaintenanceDetail({ record, onClose, onDelete, onEdit }: { record: Maintenance; onClose: () => void; onDelete: () => void; onEdit: () => void }) {
  const field = (label: string, value: string, wide = false) => <div className={`maintenance-detail-field ${wide ? "wide" : ""}`}><dt>{label}</dt><dd>{value || "미입력"}</dd></div>;
  return <ModalShell title="정비 기록 상세" subtitle={`${record.date} · ${maintenanceName(record)}`} icon={Wrench} onClose={onClose}>
    <div className="maintenance-detail-content"><dl className="maintenance-detail-grid">
      {field("정비일자", record.date)}{field("정비항목", record.item)}
      {record.otherItem && field("기타 정비명", record.otherItem, true)}
      {field("정비 시 주행거리", numberOf(record.mileage) ? `${record.mileage} km` : "")}{field("정비 비용", record.cost || "0원")}
      {field("정비 상세 내용", record.detail, true)}{field("정비소 / 업체명", record.vendor, true)}
      {field("다음 교체 권장 주행거리", record.nextMileage ? `${record.nextMileage} km` : "")}{field("다음 교체 권장일", record.nextDate)}
      <div className="maintenance-detail-field wide"><dt>영수증 / 정비명세서</dt><dd>{record.receiptUrl ? <a className="receipt-link" href={record.receiptUrl} target="_blank" rel="noreferrer">증빙 열기<ArrowUpRight size={15} /></a> : "미입력"}</dd></div>
      {field("비고", record.note, true)}
    </dl><footer className="modal-footer maintenance-detail-footer"><button type="button" className="primary-button" onClick={onEdit}><Pencil size={16} />수정하기</button><button type="button" className="danger-button" onClick={onDelete}><Trash2 size={16} />정비 기록 삭제</button><button type="button" className="secondary-button" onClick={onClose}>닫기</button></footer></div>
  </ModalShell>;
}

function MaintenanceDeleteDialog({ record, onClose, onDeleted, signInPath }: { record: Maintenance; onClose: () => void; onDeleted: (id: string) => Promise<void>; signInPath: string }) {
  const beginBusy = useBusyOperation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<{ status?: string; message: string } | null>(null);
  const remove = async () => {
    if (deleting) return;
    setDeleting(true); setError(null);
    const stopBusy = beginBusy();
    try {
      const response = await fetch("/api/maintenance/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: record.id }) });
      const result = await response.json() as { status: string; message?: string };
      if (result.status !== "success") throw result;
      await onDeleted(record.id);
    } catch (cause) {
      const failure = cause as { status?: string; message?: string };
      setError({ status: failure.status, message: failure.message ?? "삭제하지 못했습니다. 다시 시도해 주세요." });
    } finally { setDeleting(false); stopBusy(); }
  };
  return <ModalShell title="정비 기록을 삭제할까요?" subtitle="선택한 기록 한 건만 삭제합니다." icon={Trash2} onClose={() => { if (!deleting) onClose(); }}>
    <div className="maintenance-delete-content"><div className="maintenance-delete-summary"><span>{record.date}</span><strong>{maintenanceName(record)}</strong><span>{record.cost || "0원"}</span></div><p>삭제한 기록은 복구할 수 없습니다.</p>
      {error && <div className="form-error" role="alert"><CircleAlert size={17} /><span>{error.message}</span>{error.status === "authentication_required" && <a href={signInPath} target="_top">비밀번호 입력</a>}</div>}
      <footer className="modal-footer"><button type="button" className="secondary-button" onClick={onClose} disabled={deleting}>취소</button><button type="button" className="danger-button" onClick={() => void remove()} disabled={deleting}>{deleting ? <><RefreshCw size={16} className="spin" />삭제 중</> : <><Trash2 size={16} />삭제하기</>}</button></footer>
    </div>
  </ModalShell>;
}

function TableSkeleton() { return <div className="table-skeleton">{Array.from({ length: 6 }).map((_, index) => <div className="skeleton" key={index} />)}</div>; }

function ModalShell({ title, subtitle, icon: Icon, children, onClose }: { title: string; subtitle: string; icon: typeof Route; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><div className="modal-title-icon"><Icon size={21} /></div><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="닫기"><X size={20} /></button></header>{children}</section></div>;
}

function Field({ label, children, wide = false, hint }: { label: string; children: React.ReactNode; wide?: boolean; hint?: string }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function useSubmissionKey() {
  const previous = useRef<{ fingerprint: string; key: string } | null>(null);
  return (payload: Record<string, unknown>) => {
    const fingerprint = JSON.stringify(payload);
    if (previous.current?.fingerprint !== fingerprint) {
      previous.current = { fingerprint, key: crypto.randomUUID() };
    }
    return { ...payload, submissionKey: previous.current!.key };
  };
}

async function submitForm(payload: Record<string, unknown>, url = "/api/records/write") {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json() as { status: string; message?: string; record?: Maintenance | Trip };
  if (result.status !== "success") throw result;
  return result;
}

function SettingsModal({ data, onClose, onSaved, signInPath }: { data: DashboardData; onClose: () => void; onSaved: (message: string) => Promise<void>; signInPath: string }) {
  const beginBusy = useBusyOperation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ status?: string; message: string } | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const stopBusy = beginBusy();
    try {
      const response = await fetch("/api/vehicle/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: form.get("model"), plate: form.get("plate"), mileage: form.get("mileage") || 0 }),
      });
      const result = await response.json() as { status: string; message?: string };
      if (result.status !== "success") throw result;
      await onSaved("차량 설정을 저장했습니다.");
    } catch (cause) {
      const failure = cause as { status?: string; message?: string };
      setError({ status: failure.status, message: failure.message ?? "설정을 저장하지 못했습니다." });
    } finally { setSaving(false); stopBusy(); }
  };
  return <ModalShell title="차량 설정" subtitle="차량 정보와 현재 계기판의 누적 주행거리를 관리합니다." icon={Settings2} onClose={() => { if (!saving) onClose(); }}><form onSubmit={submit}><div className="form-grid">
    <Field label="차량 모델" wide><input name="model" defaultValue={data.profile.model} maxLength={80} placeholder="예: 현대 쏘나타" /></Field>
    <Field label="차량번호"><input name="plate" defaultValue={data.profile.plate} maxLength={40} placeholder="예: 123가 4567" /></Field>
    <Field label="누적 km" hint="운행·정비 기록의 가장 높은 계기판 값도 함께 반영됩니다."><input name="mileage" type="number" min="0" step="any" defaultValue={data.profile.mileage} placeholder="예: 125000" /></Field>
  </div><FormFooter saving={saving} error={error} onClose={onClose} signInPath={signInPath} /></form></ModalShell>;
}

function MaintenanceItemsModal({ items, onClose, onSaved, signInPath }: { items: string[]; onClose: () => void; onSaved: (message: string) => Promise<void>; signInPath: string }) {
  const beginBusy = useBusyOperation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ status?: string; message: string } | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const stopBusy = beginBusy();
    try {
      const response = await fetch("/api/maintenance/items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenanceItems: String(form.get("maintenanceItems") || "").split("\n").map((item) => item.trim()).filter(Boolean) }),
      });
      const result = await response.json() as { status: string; message?: string };
      if (result.status !== "success") throw result;
      await onSaved("정비 항목 목록을 저장했습니다.");
    } catch (cause) {
      const failure = cause as { status?: string; message?: string };
      setError({ status: failure.status, message: failure.message ?? "항목 목록을 저장하지 못했습니다." });
    } finally { setSaving(false); stopBusy(); }
  };
  return <ModalShell title="정비 항목 관리" subtitle="정비 기록 입력창의 선택 목록을 관리합니다." icon={Settings2} onClose={() => { if (!saving) onClose(); }}><form onSubmit={submit}>
    <Field label="정비 항목" hint="한 줄에 하나씩 입력해 주세요. 항목을 제거해도 이미 저장한 정비 기록은 보존됩니다."><textarea name="maintenanceItems" defaultValue={items.join("\n")} rows={10} required /></Field>
    <FormFooter saving={saving} error={error} onClose={onClose} signInPath={signInPath} />
  </form></ModalShell>;
}

function LocationField({ name, label, value, onChange }: { name: "departure" | "destination"; label: string; value: string; onChange: (value: string) => void }) {
  return <div className="field location-field"><label htmlFor={`trip-${name}`}>{label}</label><div className="location-input"><input id={`trip-${name}`} name={name} value={value} onChange={(event) => onChange(event.target.value)} maxLength={160} required /><button type="button" className="record-action-button" onClick={() => onChange("집")} aria-label={`${label}를 집으로 설정`}><HomeIcon size={15} />집으로</button></div></div>;
}

function TripModal({ onClose, onSaved, signInPath, record }: { onClose: () => void; onSaved: (message: string, record?: Trip) => Promise<void>; signInPath: string; record?: Trip }) {
  const withSubmissionKey = useSubmissionKey();
  const beginBusy = useBusyOperation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ status?: string; message: string } | null>(null);
  const [departure, setDeparture] = useState(record?.departure ?? "");
  const [destination, setDestination] = useState(record?.destination ?? "");
  const [startKm, setStartKm] = useState(record?.startKm ?? "");
  const [endKm, setEndKm] = useState(record?.endKm ?? "");
  const distance = Math.max(0, Number(endKm || 0) - Number(startKm || 0));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const stopBusy = beginBusy();
    try {
      const values = { kind: "trip", date: form.get("date"), departure, destination, startKm, endKm, expense: form.get("expense") || 0, expenseDetail: form.get("expenseDetail") || "", note: form.get("note") || "" };
      const result = await submitForm(record ? { ...values, id: record.id } : withSubmissionKey(values), record ? "/api/trips/update" : undefined);
      await onSaved(record ? "운행 기록을 수정했습니다." : "운행 기록을 저장했습니다.", result.record as Trip | undefined);
    } catch (cause) { const failure = cause as { status?: string; message?: string }; setError({ status: failure.status, message: failure.message ?? "저장하지 못했습니다." }); }
    finally { setSaving(false); stopBusy(); }
  };
  return <ModalShell title={record ? "운행 기록 수정" : "운행 기록 추가"} subtitle="저장한 기록은 운행 목록에 바로 반영됩니다." icon={Route} onClose={() => { if (!saving) onClose(); }}><form onSubmit={submit}><div className="form-grid trip-form-grid">
    <Field label="운행일자" wide><input name="date" type="date" defaultValue={record?.date ?? today()} required /></Field>
    <LocationField name="departure" label="출발지" value={departure} onChange={setDeparture} /><LocationField name="destination" label="목적지" value={destination} onChange={setDestination} />
    <Field label="주행 전 계기판(km)"><input name="startKm" type="number" min="0" step="any" value={startKm} onChange={(event) => setStartKm(event.target.value)} required /></Field>
    <Field label="주행 후 계기판(km)" hint={`자동 계산 주행거리: ${distance.toLocaleString("ko-KR")}km`}><input name="endKm" type="number" min="0" step="any" value={endKm} onChange={(event) => setEndKm(event.target.value)} required /></Field>
    <Field label="운행 경비(원)" wide><input name="expense" type="number" min="0" defaultValue={record ? numberOf(record.expense) : ""} /></Field>
    <Field label="경비 내용" wide><input name="expenseDetail" defaultValue={record?.expenseDetail ?? ""} placeholder="예: 주차비, 통행료" /></Field>
    <Field label="비고" wide><textarea name="note" defaultValue={record?.note ?? ""} rows={2} placeholder="추가 메모" /></Field>
  </div><FormFooter saving={saving} error={error} onClose={onClose} signInPath={signInPath} saveLabel={record ? "수정사항 저장" : "저장하기"} /></form></ModalShell>;
}

function maintenanceName(record: Maintenance) {
  return record.otherItem ? `${record.item} · ${record.otherItem}` : record.item;
}

function MaintenanceModal({ items, latestMileage, onClose, onSaved, signInPath, loadError = null, record }: { items: string[]; latestMileage: number; onClose: () => void; onSaved: (message: string, record?: Maintenance) => Promise<void>; signInPath: string; loadError?: { status: string; message: string } | null; record?: Maintenance }) {
  const availableItems = [...new Set([...(items.length ? items : DEFAULT_MAINTENANCE_ITEMS), ...(record ? [record.item] : [])])];
  const withSubmissionKey = useSubmissionKey();
  const [selectedItem, setSelectedItem] = useState(record?.item ?? "");
  const beginBusy = useBusyOperation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ status?: string; message: string } | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError(null);
    const form = new FormData(event.currentTarget);
    const stopBusy = beginBusy();
    try {
      const values = {
        kind: "maintenance", date: form.get("date"), mileage: form.get("mileage") || "",
        item: form.get("item"), otherItem: selectedItem === "기타 정비" ? form.get("otherItem") || "" : "",
        detail: form.get("detail") || "", vendor: form.get("vendor") || "", cost: form.get("cost") || "",
        nextMileage: form.get("nextMileage") || "", note: form.get("note") || "", nextDate: form.get("nextDate") || "", receiptUrl: form.get("receiptUrl") || "",
      };
      const result = await submitForm(record ? { ...values, id: record.id } : withSubmissionKey(values), record ? "/api/maintenance/update" : undefined);
      await onSaved(record ? "정비 기록을 수정했습니다." : "정비 기록을 저장했습니다.", result.record as Maintenance | undefined);
    } catch (cause) { const failure = cause as { status?: string; message?: string }; setError({ status: failure.status, message: failure.message ?? "저장하지 못했습니다." }); }
    finally { setSaving(false); stopBusy(); }
  };
  return <ModalShell title={record ? "정비 기록 수정" : "정비 기록 추가"} subtitle="정비일자와 정비항목만 입력해도 저장할 수 있습니다." icon={Wrench} onClose={() => { if (!saving) onClose(); }}>
    {loadError && <div className="form-error" role="alert"><CircleAlert size={17} /><span>기본 정비 항목을 표시하고 있습니다. {loadError.message}</span>{loadError.status === "authentication_required" && <a href={signInPath} target="_top">비밀번호 입력</a>}</div>}
    <form onSubmit={submit}><div className="form-grid">
      <Field label="정비일자 *"><input name="date" type="date" defaultValue={record?.date ?? today()} required /></Field>
      <Field label="정비항목 *"><select name="item" required value={selectedItem} onChange={(event) => setSelectedItem(event.target.value)}><option value="" disabled>항목 선택</option>{availableItems.map((item) => <option key={item}>{item}</option>)}</select></Field>
      {selectedItem === "기타 정비" && <Field label="기타 정비항목" wide hint="선택 입력 · 실제 정비한 항목을 적어 주세요."><input name="otherItem" defaultValue={record?.otherItem ?? ""} maxLength={80} placeholder="예: 헤드램프 교체, 도어 수리" /></Field>}
      <Field label="정비 시 주행거리(km)" hint={latestMileage ? `최근 기록: ${latestMileage.toLocaleString("ko-KR")}km · 선택 입력` : "선택 입력"}><input name="mileage" defaultValue={record && numberOf(record.mileage) ? numberOf(record.mileage) : ""} type="number" min="0" placeholder="선택 입력" /></Field>
      <Field label="정비 비용(원)"><input name="cost" defaultValue={record ? numberOf(record.cost) : ""} type="number" min="0" placeholder="선택 입력" /></Field>
      <Field label="정비 상세 내용" wide><input name="detail" defaultValue={record?.detail ?? ""} placeholder="선택 입력 · 예: 합성유 5W-30 교환" /></Field>
      <Field label="정비소 / 업체명" wide><input name="vendor" defaultValue={record?.vendor ?? ""} placeholder="선택 입력" /></Field>
      <Field label="다음 교체 권장 주행거리"><input name="nextMileage" defaultValue={record?.nextMileage ?? ""} type="number" min="0" placeholder="선택 입력" /></Field>
      <Field label="다음 교체 권장일"><input name="nextDate" defaultValue={record?.nextDate ?? ""} type="date" /></Field>
      <Field label="영수증 / 정비명세서 링크" wide><input name="receiptUrl" defaultValue={record?.receiptUrl ?? ""} type="url" placeholder="https://" /></Field>
      <Field label="비고" wide><textarea name="note" defaultValue={record?.note ?? ""} rows={2} placeholder="선택 입력" /></Field>
    </div><FormFooter saving={saving} error={error} onClose={onClose} signInPath={signInPath} saveLabel={record ? "수정사항 저장" : "저장하기"} /></form>
  </ModalShell>;
}

function FormFooter({ saving, error, onClose, signInPath, saveLabel = "저장하기" }: { saving: boolean; error: { status?: string; message: string } | null; onClose: () => void; signInPath: string; saveLabel?: string }) {
  return <><div className="write-notice"><ShieldCheck size={17} /><span>저장한 기록은 가족이 함께 사용하는 차량 기록에 반영됩니다.</span></div>{error && <div className="form-error" role="alert"><CircleAlert size={17} /><span>{error.message}</span>{error.status === "authentication_required" && <a href={signInPath} target="_top">비밀번호 입력</a>}</div>}<footer className="modal-footer"><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>취소</button><button type="submit" className="primary-button" disabled={saving}>{saving ? <><RefreshCw className="spin" size={16} />저장 중</> : <><CheckCircle2 size={17} />{saveLabel}</>}</button></footer></>;
}
