// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { BadRequestException, Injectable, Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { LETTER_DISCLAIMER } from "../domain/legal-refs";
import { LetterValidationError, renderLetter, validateFields } from "../domain/letter";
import { rightByCode } from "../domain/rights.catalog";

const fmtDate = (d: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(d);

@Injectable()
export class LettersService {
  constructor(private prisma: PrismaService) {}
  /** Surat dari template aktif + isian pengguna. Tidak menulis apa pun; pemanggil yang menyimpan. */
  async compose(rightCode: string, companyId: string, fields: Record<string, string>, now = new Date()) {
    const def = rightByCode(rightCode)!;
    try {
      validateFields(def.fields, fields);
    } catch (e) {
      if (e instanceof LetterValidationError) throw new BadRequestException(e.message);
      throw e;
    }
    const [company, tpl] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.requestTemplate.findFirstOrThrow({ where: { rightCode, active: true }, orderBy: { version: "desc" } }),
    ]);
    const vals: Record<string, string> = {
      companyName: company.legalName ?? company.name,
      subject: `Permohonan ${def.title} Data Pribadi`,
      date: fmtDate(now),
      ...fields,
    };
    def.fields.forEach((f) => {
      if (!(f.key in vals)) vals[f.key] = "";
    });
    return { body: renderLetter(tpl.body, vals), templateVersion: tpl.version, disclaimer: LETTER_DISCLAIMER };
  }
}
@Module({ providers: [LettersService], exports: [LettersService] })
export class LettersModule {}
