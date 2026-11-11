// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { connect } from "node:net";
import { createHash, randomUUID } from "node:crypto";

/** Bukti kirim: contentSha256 = SHA-256 dari `${subject}\n\n${text}` (UTF-8). */
export interface MailReceipt {
  messageId: string;
  sentAt: Date;
  contentSha256: string;
}

/**
 * Klien SMTP minimal untuk Mailpit (dev).
 * shortcut: tanpa TLS/AUTH, hanya untuk SMTP dev tangkap-semua; untuk SMTP sungguhan ganti isi send() dengan nodemailer
 * (belum terpasang: registry npm tidak terjangkau saat Fase 2).
 */
@Injectable()
export class Mailer {
  private log = new Logger("Mailer");
  async send(to: string, subject: string, text: string, o: { replyTo?: string } = {}): Promise<MailReceipt> {
    if (/[\r\n<>]/.test(to + (o.replyTo ?? "")) || /[\r\n]/.test(subject)) throw new Error("Header email tidak valid"); // anti header injection
    const from = process.env.MAIL_FROM ?? "no-reply@hakdata.example";
    const messageId = `<${randomUUID()}@${from.split("@")[1] ?? "hakdata.local"}>`;
    const sentAt = new Date();
    await this.deliver(to, subject, text, from, messageId, sentAt, o.replyTo);
    return { messageId, sentAt, contentSha256: createHash("sha256").update(`${subject}\n\n${text}`).digest("hex") };
  }
  private deliver(
    to: string,
    subject: string,
    text: string,
    from: string,
    messageId: string,
    sentAt: Date,
    replyTo?: string,
  ): Promise<void> {
    const host = process.env.MAIL_HOST ?? "localhost",
      port = Number(process.env.MAIL_PORT ?? 1025);
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
    const msg = [
      `From: Hak Data <${from}>`,
      `To: <${to}>`,
      `Message-ID: ${messageId}`,
      `Date: ${sentAt.toUTCString()}`,
      ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64(text).replace(/(.{76})/g, "$1\r\n"),
    ].join("\r\n");
    const steps = ["EHLO hakdata.local", `MAIL FROM:<${from}>`, `RCPT TO:<${to}>`, "DATA", `${msg}\r\n.`, "QUIT"];
    return new Promise((resolve, reject) => {
      const s = connect({ host, port });
      let i = -1,
        buf = "";
      s.setTimeout(8000, () => s.destroy(new Error("SMTP timeout")));
      s.on("error", (e) => {
        this.log.warn(`Gagal kirim email: ${e.message}`); // tanpa alamat tujuan dan isi
        reject(e);
      });
      s.on("data", (d) => {
        buf += d.toString();
        if (!/(^|\r\n)\d{3} [^\r\n]*\r\n$/.test(buf)) return; // tunggu baris terakhir balasan (kode + spasi)
        const code = Number(buf.slice(0, 3));
        buf = "";
        if (code >= 400) return s.destroy(new Error(`SMTP ${code}`));
        if (++i < steps.length) s.write(steps[i] + "\r\n");
        if (steps[i] === "QUIT") s.end();
      });
      // Sukses HANYA bila server sudah menerima isi pesan (250 setelah DATA, lalu kita kirim QUIT). Koneksi yang ditutup lebih awal
      // bukan bukti kirim: tanpa cek ini, EmailDelivery tercatat untuk email yang tidak pernah diterima.
      const quitAt = steps.length - 1;
      s.on("close", () => (i >= quitAt ? resolve() : reject(new Error("SMTP terputus sebelum pesan diterima"))));
    });
  }
}

@Global()
@Module({ providers: [Mailer], exports: [Mailer] })
export class MailModule {}
