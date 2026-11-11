// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "./Logo";
import { useAuth } from "@/lib/auth";
import { gql } from "@/lib/api";

export function SiteHeader() {
  const { me, logout } = useAuth(); const [unread, setUnread] = useState(0);
  useEffect(() => { if (me) gql<{ unreadCount: number }>(`{unreadCount}`).then((d) => setUnread(d.unreadCount)).catch(() => {}); else setUnread(0); }, [me]);
  return (
    <header className="nav">
      <Link href="/" aria-label="Hak Data, beranda"><Wordmark /></Link>
      <nav aria-label="Utama">
        <Link href="/perusahaan">Direktori</Link><Link href="/hak">Hak kamu</Link><Link href="/tentang">Tentang</Link>
        {me ? (<>
          <Link href="/app">Dashboard</Link><Link href="/app/profil">Profil</Link>
          {me.role !== "USER" && <Link href="/admin">Admin</Link>}
          <Link href="/app/notifikasi" className="bell" aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`}>🔔{unread > 0 && <b>{unread}</b>}</Link>
          <button className="btn btn-ghost" onClick={logout}>Keluar</button>
        </>) : (<><Link href="/masuk">Masuk</Link><Link className="btn btn-primary" href="/daftar">Mulai gratis</Link></>)}
      </nav>
    </header>
  );
}
export const SiteFooter = () => (
  <footer className="foot">
    <p><strong>Bukan nasihat hukum.</strong> Hak Data membantu administrasi dan dokumentasi; bukan pengadilan, regulator, atau firma hukum, dan tidak menjamin permintaan dikabulkan. Hasil bergantung pada ketentuan hukum dan respons pengendali data. Estimasi tenggat adalah alat bantu berdasarkan aturan yang tercatat dan dapat berubah saat regulasi berubah.</p>
    <p className="muted">Proyek MVP/demo. Data perusahaan berlabel DEMO bersifat fiktif. © 2026 Vassel Goleyu</p>
  </footer>
);
