import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { privacyTemplate, publicPrivacyText } from "@/lib/privacy";
import { isValidSlug } from "@/lib/slug";
import { prisma } from "@/server/db";
import { PrivacyText } from "../privacy-text";

export const metadata: Metadata = { title: "Confidențialitate" };

/** Public: the privacy notice of one church (its edited text, or the template with its details). */
export default async function ChurchPrivacyPage({ params }: PageProps<"/confidentialitate/[slug]">) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const church = await prisma.church.findUnique({ where: { slug }, select: { nume: true, email: true, adresa: true, privacyText: true, extractEnabled: true } });
  if (!church) notFound();
  return (
    <>
      <h2 className="text-2xl mb-1">Confidențialitatea datelor</h2>
      <p className="hint mb-4">Biserica {church.nume}</p>
      <PrivacyText text={publicPrivacyText(church.privacyText.trim() || privacyTemplate(church), church.extractEnabled)} />
    </>
  );
}
