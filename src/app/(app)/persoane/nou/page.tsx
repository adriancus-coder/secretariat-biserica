import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { getChurch } from "@/server/queries/church";
import { familyNames } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { PersonForm } from "../person-form";

export const metadata: Metadata = { title: "Persoană nouă" };

export default async function NewPersonPage({ searchParams }: PageProps<"/persoane/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const [church, families] = await Promise.all([getChurch(ctx), familyNames(ctx)]);
  const familie = typeof sp.familie === "string" ? sp.familie.slice(0, 100) : "";
  return (
    <>
      <BackLink href="/persoane">Persoane</BackLink>
      <PageHead title="Persoană nouă" />
      <PersonForm
        id={null}
        initial={{ statut: "MEMBRU", familie }}
        families={families}
        rudenie={church.nomen.rudenie}
        cancelHref="/persoane"
      />
    </>
  );
}
