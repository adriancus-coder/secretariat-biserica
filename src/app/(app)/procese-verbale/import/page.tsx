import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { todayIso } from "@/lib/dates";
import { attendancePrefill } from "@/server/queries/attendance";
import { getChurch } from "@/server/queries/church";
import { attendeeOptions } from "@/server/queries/meetings";
import { isExtractConfigured } from "@/server/extract";
import { requireCtx } from "@/server/session";
import { MinutesImport } from "./minutes-import";

export const metadata: Metadata = { title: "Importă proces-verbal" };

export default async function MinutesImportPage() {
  const ctx = await requireCtx("write");
  const [church, people, prefill] = await Promise.all([getChurch(ctx), attendeeOptions(ctx, []), attendancePrefill(ctx, todayIso())]);
  return (
    <>
      <BackLink href="/procese-verbale">Procese-verbale</BackLink>
      <PageHead title="Importă proces-verbal" />
      <MinutesImport
        aiConfigured={isExtractConfigured() && church.extractEnabled}
        people={people}
        tipuri={church.nomen.tipuriSedinte}
        rules={church.attendanceRules}
        prefill={prefill}
        tipuriAG={church.tipuriAG}
      />
    </>
  );
}
