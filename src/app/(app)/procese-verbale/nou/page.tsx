import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { isIsoDate, todayIso } from "@/lib/dates";
import { attendancePrefill } from "@/server/queries/attendance";
import { getChurch } from "@/server/queries/church";
import { attendeeOptions } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";
import { MeetingForm } from "../meeting-form";

export const metadata: Metadata = { title: "Ședință nouă" };

export default async function NewMeetingPage({ searchParams }: PageProps<"/procese-verbale/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const data = typeof sp.data === "string" && isIsoDate(sp.data) ? sp.data : todayIso();
  const [church, prefill] = await Promise.all([getChurch(ctx), attendancePrefill(ctx, data)]);
  const tip = church.nomen.tipuriSedinte[0] ?? "";
  // The first type's attendance rule fills the list from the start (Comitet → the committee).
  const rule = church.attendanceRules[tip] ?? "MANUAL";
  const selected = rule === "MANUAL" ? [] : prefill[rule];
  const people = await attendeeOptions(ctx, selected);
  return (
    <>
      <BackLink href="/procese-verbale">Procese-verbale</BackLink>
      <PageHead title="Ședință nouă" />
      <MeetingForm
        id={null}
        initial={{ data, tip, presedinte: church.pastor }}
        selected={selected}
        people={people}
        tipuri={church.nomen.tipuriSedinte}
        rules={church.attendanceRules}
        prefill={prefill}
        cancelHref="/procese-verbale"
      />
    </>
  );
}
