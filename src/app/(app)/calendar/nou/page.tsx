import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { isIsoDate, todayIso } from "@/lib/dates";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";
import { EventForm } from "../event-form";

export const metadata: Metadata = { title: "Eveniment nou" };

export default async function NewEventPage({ searchParams }: PageProps<"/calendar/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const church = await getChurch(ctx);
  const data = typeof sp.data === "string" && isIsoDate(sp.data) ? sp.data : todayIso();
  return (
    <>
      <BackLink href={`/calendar?zi=${data}&luna=${data.slice(0, 7)}`}>Calendar</BackLink>
      <PageHead title="Eveniment nou" />
      <EventForm
        id={null}
        initial={{ data, tip: church.nomen.tipuriEvenimente[0] ?? "" }}
        contributii={[]}
        tipuri={church.nomen.tipuriEvenimente}
        cancelHref="/calendar"
      />
    </>
  );
}
