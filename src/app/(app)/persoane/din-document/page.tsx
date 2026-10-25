import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getChurch } from "@/server/queries/church";
import { familyOptions } from "@/server/queries/families";
import { roleChoices } from "@/server/queries/roles";
import { isExtractConfigured } from "@/server/extract";
import { requireCtx } from "@/server/session";
import { PersonFromDocument } from "./person-from-document";

export const metadata: Metadata = { title: "Adaugă din document" };

export default async function PersonFromDocumentPage() {
  const ctx = await requireCtx("write");
  const [church, families, roles] = await Promise.all([getChurch(ctx), familyOptions(ctx), roleChoices(ctx, null)]);
  return (
    <>
      <BackLink href="/persoane">Persoane</BackLink>
      <PageHead title="Adaugă din document" />
      {isExtractConfigured() ? (
        <PersonFromDocument families={families} rudenie={church.nomen.rudenie} roles={roles} />
      ) : (
        <div className="alert">Extragerea din imagini nu este configurată. Adăugați persoana cu formularul obișnuit.</div>
      )}
    </>
  );
}
