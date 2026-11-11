// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
"use client";
import { useState } from "react";
import { gql } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Confirm, useToast } from "@/components/ui";

export default function Profile() {
  const { me } = useAuth(); const toast = useToast(); const [del, setDel] = useState(false);
  const exportData = async () => { try { const d = await gql<any>(`{myDataExport{data}}`); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(d.myDataExport.data, null, 2)], { type: "application/json" })); a.download = "data-saya-hakdata.json"; a.click(); } catch (e) { toast((e as Error).message, "err"); } };
  return (<div className="page"><h1>Profil & privasi</h1>
    <section className="panel"><dl className="kv"><dt>Nama</dt><dd>{me?.name}</dd><dt>Email</dt><dd>{me?.email}</dd><dt>Peran</dt><dd>{me?.role}</dd></dl></section>
    <section className="panel" style={{ marginTop: 16 }}><h2>Data yang kami simpan</h2><ul><li>Akun: nama, email, kata sandi (hash bcrypt, tidak pernah plaintext).</li><li>Permintaan, surat, dossier, dan berkas bukti yang kamu buat.</li><li>Kami <strong>tidak</strong> meminta KTP, biometrik, atau data sensitif.</li></ul>
      <div className="row"><Button variant="ghost" onClick={exportData}>Ekspor data saya (JSON)</Button></div></section>
    <section className="panel" style={{ marginTop: 16 }}><h2>Hapus akun</h2><p>Akun dianonimkan, isi surat dan isian permintaan dikosongkan, notifikasi dihapus. Catatan audit administratif dan salinan cadangan (bila ada) mengikuti kebijakan retensi tersendiri dan tidak otomatis terhapus seketika.</p>
      <Button variant="danger" onClick={() => setDel(true)}>Hapus akun saya</Button></section>
    <Confirm open={del} danger title="Hapus akun?" body="Tindakan ini tidak dapat dibatalkan." confirmLabel="Hapus akun" onCancel={() => setDel(false)} onConfirm={async () => { try { await gql(`mutation{deleteMyAccount}`); location.href = "/"; } catch (e) { toast((e as Error).message, "err"); setDel(false); } }} /></div>);
}
