// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { createServer, Server, Socket } from "node:net";
import { AddressInfo } from "node:net";
import { Mailer } from "./mailer";

/** Server SMTP palsu: `script(line, sock)` memutuskan balasan tiap perintah. */
function smtp(script: (line: string, s: Socket) => void): Promise<Server> {
  const srv = createServer((s) => {
    s.write("220 palsu\r\n");
    let buf = "",
      inData = false;
    s.on("data", (d) => {
      buf += d.toString();
      let k: number;
      while ((k = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, k);
        buf = buf.slice(k + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            script(".", s);
          }
          continue;
        }
        if (line === "DATA") inData = true;
        script(line, s);
      }
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}
const ok = (line: string, s: Socket) => s.write(line === "DATA" ? "354 lanjut\r\n" : line === "QUIT" ? "221 dah\r\n" : "250 ok\r\n");

describe("Mailer: bukti kirim hanya bila server menerima pesan", () => {
  let srv: Server;
  afterEach(() => new Promise((r) => srv.close(r)));
  const send = () => {
    process.env.MAIL_HOST = "127.0.0.1";
    process.env.MAIL_PORT = String((srv.address() as AddressInfo).port);
    return new Mailer().send("a@b.example", "Subjek", "Isi");
  };

  it("dialog lengkap: resolve dengan message-id dan hash isi", async () => {
    srv = await smtp(ok);
    const r = await send();
    expect(r.messageId).toMatch(/^<.+@.+>$/);
    expect(r.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("server menutup koneksi setelah DATA tanpa menerima isi: reject (bukan bukti kirim palsu)", async () => {
    srv = await smtp((line, s) => (line === "." ? s.end() : ok(line, s)));
    await expect(send()).rejects.toThrow(/terputus/);
  });
  it("server menolak penerima (550): reject", async () => {
    srv = await smtp((line, s) => (line.startsWith("RCPT") ? s.write("550 tidak ada\r\n") : ok(line, s)));
    await expect(send()).rejects.toThrow(/SMTP 550/);
  });
  it("header injection pada tujuan ditolak sebelum menyambung", async () => {
    srv = await smtp(ok);
    await expect(new Mailer().send("a@b.example\r\nBcc: x@y.example", "S", "I")).rejects.toThrow(/Header email/);
  });
});
