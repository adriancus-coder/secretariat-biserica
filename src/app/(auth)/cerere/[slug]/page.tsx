import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveNomen } from "@/lib/labels";
import { APPLICATIONS_CLOSED_MESSAGE } from "@/lib/schemas/application";
import { isValidSlug } from "@/lib/slug";
import { prisma } from "@/server/db";
import { ApplicationForm } from "./application-form";

export const metadata: Metadata = { title: "Cerere de membru" };

/** Public page, no session: the church is found by its slug (global client, read-only fields). */
async function findChurch(slug: string) {
  if (!isValidSlug(slug)) return null;
  return prisma.church.findUnique({
    where: { slug },
    select: { nume: true, slug: true, applicationsOpen: true, gradeRudenie: true },
  });
}

export default async function ApplicationPage({ params }: PageProps<"/cerere/[slug]">) {
  const { slug } = await params;
  const church = await findChurch(slug);
  if (!church) notFound();
  if (!church.applicationsOpen) {
    return (
      <>
        <h2 className="text-2xl mb-2">{church.nume}</h2>
        <p className="hint">{APPLICATIONS_CLOSED_MESSAGE}</p>
      </>
    );
  }
  return (
    <>
      <h2 className="text-2xl mb-1">Cerere de membru</h2>
      <p className="hint mb-5">
        {church.nume}. Completați formularul; biserica vă va contacta după ce cererea este analizată.
      </p>
      <ApplicationForm slug={church.slug} rudenie={resolveNomen({ rudenie: church.gradeRudenie }).rudenie} />
    </>
  );
}
