import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { resolveLayout } from "@/lib/page-layout";
import { permissions } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";
import { LayoutEditor } from "./layout-editor";

export const metadata: Metadata = { title: "Așezare în pagină" };

/** "Așezare în pagină": margins, text size, line spacing, alignment and letterhead of the printed minutes. */
export default async function MeetingLayoutPage({ params }: PageProps<"/procese-verbale/[id]/asezare">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const ctx = await requireCtx("write");
  const [m, church] = await Promise.all([
    ctx.db.meeting.findUnique({ where: { id }, select: { id: true, nr: true, anRegistru: true, tip: true, locked: true, layout: true } }),
    getChurch(ctx),
  ]);
  if (!m) notFound();
  const title = m.nr !== null ? `Proces verbal nr. ${m.nr}/${m.anRegistru}` : `Proces verbal (${m.tip})`;
  return (
    <>
      <BackLink href={`/procese-verbale/${id}`}>{title}</BackLink>
      <PageHead title="Așezare în pagină" sub="Pentru PDF și pentru documentul Word" />
      <LayoutEditor
        meetingId={id}
        initial={resolveLayout(church.pvLayout, m.layout)}
        churchDefault={church.pvLayout}
        hasOwn={m.layout !== null}
        locked={m.locked}
        canSetDefault={permissions.admin(ctx.user.role)}
      />
    </>
  );
}
