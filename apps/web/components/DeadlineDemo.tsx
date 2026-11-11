// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import { useEffect, useState } from "react";

// SIMULATED: durasi ini hanya ilustrasi animasi, BUKAN tenggat hukum.
const DEMO_TOTAL = 100;
export function DeadlineDemo() {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(62);
      return;
    }
    const t = setInterval(() => setV((x) => (x >= DEMO_TOTAL ? 0 : x + 1)), 90);
    return () => clearInterval(t);
  }, []);
  const c = 2 * Math.PI * 52;
  return (
    <div className="demo" aria-label="Contoh simulasi pelacak tenggat">
      <span className="chip chip-demo">CONTOH · SIMULASI</span>
      <svg viewBox="0 0 120 120" className="ring" aria-hidden>
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#00c8ff" />
            <stop offset="1" stopColor="#8a2cff" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="52" className="ring-bg" />
        <circle cx="60" cy="60" r="52" className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - v / DEMO_TOTAL)} />
      </svg>
      <div className="demo-meta">
        <strong>Permintaan Akses Data</strong>
        <span>Tenggat dihitung dari aturan hukum terverifikasi, lengkap dengan dasar pasalnya.</span>
        <span className="muted">
          Aturan belum terverifikasi akan ditandai <em>RULE_NOT_VERIFIED</em>.
        </span>
      </div>
    </div>
  );
}
