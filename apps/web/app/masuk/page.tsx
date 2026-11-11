// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { gql } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Field } from "@/components/ui";

export default function Login() {
  const r = useRouter();
  const { refresh } = useAuth();
  const [e, setE] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await gql(`mutation($e:String!,$p:String!){login(email:$e,password:$p){id}}`, { e, p });
      await refresh();
      r.push("/app");
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page narrow">
      <h1>Masuk</h1>
      <form className="panel" onSubmit={go}>
        <Field label="Email" type="email" required autoComplete="email" value={e} onChange={(x: any) => setE(x.target.value)} />
        <Field
          label="Kata sandi"
          type="password"
          required
          autoComplete="current-password"
          value={p}
          onChange={(x: any) => setP(x.target.value)}
          error={err}
        />
        <Button type="submit" loading={busy}>
          Masuk
        </Button>
        <p className="muted">
          Belum punya akun? <Link href="/daftar">Daftar</Link>
        </p>
      </form>
    </div>
  );
}
