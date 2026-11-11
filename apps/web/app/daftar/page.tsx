// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useState } from "react";
import { gql } from "@/lib/api";
import { Button, Field } from "@/components/ui";

export default function Register() {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const go = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await gql(`mutation($e:String!,$p:String!,$n:String!){register(email:$e,password:$p,name:$n){id}}`, {
        e: f.email,
        p: f.password,
        n: f.name,
      });
      setSent(true); // akun belum aktif sampai email diverifikasi; tidak ada sesi
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: string) => (x: any) => setF({ ...f, [k]: x.target.value });
  if (sent)
    return (
      <div className="page narrow">
        <h1>Cek email Anda</h1>
        <div className="panel">
          <p>
            Kami mengirim tautan verifikasi ke <strong>{f.email}</strong> (berlaku 24 jam). Buka tautan itu, lalu{" "}
            <Link href="/masuk">masuk</Link>.
          </p>
        </div>
      </div>
    );
  return (
    <div className="page narrow">
      <h1>Buat akun</h1>
      <form className="panel" onSubmit={go}>
        <Field label="Nama" required autoComplete="name" value={f.name} onChange={set("name")} hint="Dipakai pada surat permintaan." />
        <Field label="Email" type="email" required autoComplete="email" value={f.email} onChange={set("email")} />
        <Field
          label="Kata sandi"
          type="password"
          required
          autoComplete="new-password"
          minLength={10}
          value={f.password}
          onChange={set("password")}
          hint="Minimal 10 karakter."
          error={err}
        />
        <p className="muted">Kami tidak meminta KTP atau data sensitif. Anda dapat mengekspor dan menghapus akun kapan saja.</p>
        <Button type="submit" loading={busy}>
          Daftar
        </Button>
        <p className="muted">
          Sudah punya akun? <Link href="/masuk">Masuk</Link>
        </p>
      </form>
    </div>
  );
}
