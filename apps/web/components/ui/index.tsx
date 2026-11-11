// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export const Badge = ({ tone = "muted", children }: { tone?: string; children: ReactNode }) => <span className={`badge badge-${tone}`}>{children}</span>;

export function Button({ loading, variant = "primary", children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: "primary" | "ghost" | "danger" }) {
  return <button {...p} disabled={p.disabled || loading} aria-busy={loading} className={`btn btn-${variant} ${p.className ?? ""}`}>{loading && <span className="spin" aria-hidden />}{children}</button>;
}

export function Field({ label, hint, error, multiline, ...p }: { label: string; hint?: string; error?: string; multiline?: boolean } & Record<string, any>) {
  const id = useId();
  const props = { id, "aria-invalid": !!error, "aria-describedby": `${id}-d`, ...p };
  return (<div className="field"><label htmlFor={id}>{label}{p.required && <span aria-hidden> *</span>}</label>
    {multiline ? <textarea rows={3} {...props} /> : p.options ? <select {...props}>{p.options.map((o: [string, string]) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select> : <input {...props} />}
    <small id={`${id}-d`} className={error ? "err" : ""}>{error ?? hint ?? ""}</small></div>);
}

type Toast = { id: number; text: string; tone: string };
const ToastCtx = createContext<(t: string, tone?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone = "ok") => { const id = Date.now() + Math.random(); setList((l) => [...l, { id, text, tone }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4500); }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" role="status" aria-live="polite">{list.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}</div></ToastCtx.Provider>;
}

export function Confirm({ open, title, body, confirmLabel = "Ya, lanjutkan", danger, onConfirm, onCancel }: { open: boolean; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close(); }, [open]);
  return (<dialog ref={ref} className="modal" onClose={onCancel} aria-labelledby="cf-t"><h3 id="cf-t">{title}</h3><div className="modal-body">{body}</div>
    <div className="row end"><Button variant="ghost" onClick={onCancel}>Batal</Button><Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></div></dialog>);
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <div role="tablist" className="tabs">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export const Empty = ({ title, body, action }: { title: string; body?: string; action?: ReactNode }) => <div className="empty"><strong>{title}</strong>{body && <p>{body}</p>}{action}</div>;
export const Skeleton = ({ h = 80 }: { h?: number }) => <div className="skeleton" style={{ height: h }} aria-hidden />;
export const ErrorBox = ({ error, retry }: { error: string; retry?: () => void }) => <div className="errbox" role="alert"><strong>Terjadi masalah</strong><p>{error}</p>{retry && <Button variant="ghost" onClick={retry}>Coba lagi</Button>}</div>;

export function Pager({ total, take, skip, onSkip }: { total: number; take: number; skip: number; onSkip: (n: number) => void }) {
  if (total <= take) return null; const page = Math.floor(skip / take) + 1, pages = Math.ceil(total / take);
  return <nav className="pager" aria-label="Halaman"><Button variant="ghost" disabled={skip === 0} onClick={() => onSkip(Math.max(0, skip - take))}>Sebelumnya</Button><span>Halaman {page} dari {pages}</span><Button variant="ghost" disabled={skip + take >= total} onClick={() => onSkip(skip + take)}>Berikutnya</Button></nav>;
}

/** Muat data sekali, dengan state loading/error. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const run = useCallback(async () => { setLoading(true); setError(null); try { setData(await fn()); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}
