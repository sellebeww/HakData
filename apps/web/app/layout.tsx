// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

const display = Outfit({ subsets: ["latin"], variable: "--f-display", weight: ["500", "700", "800"] });
const body = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--f-body" });

export const metadata: Metadata = {
  title: "Hak Data — Tagih jawaban atas datamu",
  description: "Susun, kirim, dan lacak permintaan hak subjek data pribadi berdasarkan UU PDP, dalam satu dossier.",
  authors: [{ name: "Vassel Goleyu" }], other: { copyright: "Vassel Goleyu" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="skip" href="#main">Lewati ke konten</a>
        <div className="aurora" aria-hidden><i /><i /><i /></div>
        <AuthProvider><ToastProvider><SiteHeader /><main id="main">{children}</main><SiteFooter /></ToastProvider></AuthProvider>
      </body>
    </html>
  );
}
