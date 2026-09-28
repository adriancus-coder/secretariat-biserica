import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { groupMemberOptions } from "@/server/queries/groups-notes";
import { requireCtx } from "@/server/session";
import { GroupForm } from "../group-form";

export const metadata: Metadata = { title: "Grup nou" };

export default async function NewGroupPage() {
  const ctx = await requireCtx("write");
  const people = await groupMemberOptions(ctx, []);
  return (
    <>
      <BackLink href="/grupuri">Grupuri</BackLink>
      <PageHead title="Grup nou" />
      <GroupForm id={null} initial={{ nume: "", responsabil: "", descriere: "" }} selected={[]} people={people} cancelHref="/grupuri" />
    </>
  );
}
