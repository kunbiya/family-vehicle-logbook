"use client";

import { useState, type FormEvent } from "react";
import { CarFront, ShieldCheck, RefreshCw, CircleAlert } from "lucide-react";
import { useBusyOperation } from "./busy-layer";

export function FamilyLogin({ configured }: { configured: boolean }) {
  const beginBusy = useBusyOperation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(null);
    const form = event.currentTarget;
    const stopBusy = beginBusy();
    try {
      const response = await fetch("/api/family/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: new FormData(form).get("password") }),
      });
      const result = await response.json() as { status: string; message?: string };
      if (result.status !== "success") throw new Error(result.message ?? "접속하지 못했습니다.");
      form.reset();
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "접속하지 못했습니다. 다시 시도해 주세요.");
      setSaving(false);
    } finally { stopBusy(); }
  };
  return <main className="family-entry"><section className="family-entry-card">
    <div className="brand-mark"><CarFront size={25} /></div>
    <span className="eyebrow">FAMILY DRIVELOG</span>
    <h1>가족 차량 관리</h1>
    <p>가족 공용 비밀번호를 입력해 주세요.</p>
    <form onSubmit={submit}>
      <label className="field"><span>공용 비밀번호</span><input name="password" type="password" autoComplete="current-password" maxLength={256} required autoFocus disabled={!configured || saving} /></label>
      {!configured && <div className="form-error" role="alert"><CircleAlert size={17} /><span>공용 비밀번호 환경변수 설정이 필요합니다.</span></div>}
      {error && <div className="form-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
      <button className="primary-button" type="submit" disabled={!configured || saving}>{saving ? <><RefreshCw size={17} className="spin" />확인 중</> : <><ShieldCheck size={17} />접속하기</>}</button>
    </form>
    <small>이 기기에서 7일간 접속 상태가 유지됩니다.</small>
  </section></main>;
}
