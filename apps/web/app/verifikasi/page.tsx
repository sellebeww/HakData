// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { gql } from "@/lib/api";

export default function VerifyEmail() {
  const [state, setState] = useState<{ s: "loading" | "ok" | "error"; msg?: string }>({ s: "loading" });
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token");
    if (!token) return setState({ s: "error", msg: "Tautan verifikasi tidak lengkap." });
    gql(`mutation($t:String!){verifyEmail(token:$t)}`, { t: token })
      .then(() => setState({ s: "ok" }))
      .catch((e: Error) => setState({ s: "error", msg: e.message }));
  }, []);
  return (
    <div className="page narrow">
      <h1>Verifikasi email</h1>
      <div className="panel" role="status" aria-live="polite">
        {state.s === "loading" && <p>Memverifikasi…</p>}
        {state.s === "ok" && (
          <p>
            Email terverifikasi. Silakan <Link href="/masuk">masuk</Link>.
          </p>
        )}
        {state.s === "error" && (
          <p>
            {state.msg} Di halaman <Link href="/masuk">masuk</Link> Anda dapat meminta tautan verifikasi baru.
          </p>
        )}
      </div>
    </div>
  );
}
