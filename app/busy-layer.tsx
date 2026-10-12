"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { BusyOperations } from "@/lib/busy-operations";

const BusyContext = createContext<() => () => void>(() => () => {});

export function useBusyOperation() { return useContext(BusyContext); }

export function BusyOverlay() {
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlay.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return <div className="busy-layer" ref={overlay} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="busy-title" onKeyDown={(event) => { if (event.key === "Tab" || event.key === "Escape") event.preventDefault(); }}>
    <div className="busy-message" role="status" aria-live="polite">
      <span className="busy-spinner" aria-hidden="true" />
      <strong id="busy-title">로딩중</strong>
      <span>불러오는 중입니다. 잠시만 기다려주세요.</span>
    </div>
  </div>;
}

export function BusyProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const operations = useRef<BusyOperations | null>(null);
  if (!operations.current) operations.current = new BusyOperations(setCount);
  const begin = useCallback(() => operations.current!.begin(), []);
  const busy = count > 0;
  return <BusyContext.Provider value={begin}>
    <div className="busy-content" inert={busy} aria-busy={busy}>{children}</div>
    {busy && <BusyOverlay />}
  </BusyContext.Provider>;
}
