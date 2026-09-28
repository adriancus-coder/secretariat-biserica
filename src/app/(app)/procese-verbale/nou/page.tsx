import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { isIsoDate, todayIso } from "@/lib/dates";
import { getChurch } from "@/server/queries/church";
import { attendeeOptions } from "@/server/queries/meetings";
import { requireCtx } from "@/server/session";
import { MeetingForm } from "../meeting-form";

export const metadata: Metadata = { title: "Ședință nouă" };

export default async function NewMeetingPage({ searchParams }: PageProps<"/procese-verbale/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const [church, people] = await Promise.all([getChurch(ctx), attendeeOptions(ctx, [])]);
  const data = typeof sp.data === "string" && isIsoDate(sp.data) ? sp.data : todayIso();
  return (
    <>
      <BackLink href="/procese-verbale">Procese-verbale</BackLink>
      <PageHead title="Ședință nouă" />
      <MeetingForm
        id={null}
        initial={{ data, tip: church.nomen.tipuriSedinte[0] ?? "", presedinte: church.pastor }}
        selected={[]}
        people={people}
        tipuri={church.nomen.tipuriSedinte}
        cancelHref="/procese-verbale"
      />
    </>
  );
}
