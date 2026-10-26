import type { Metadata } from "next";
import { PageHead } from "@/components/ui/page-head";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Rugăciune" };

/** The weekly prayer for families: the only register page of the "Rugăciune" role. */
export default async function PrayerPage() {
  await requireCtx("rugaciune");
  return (
    <>
      <PageHead title="Rugăciunea săptămânală" />
      <div className="card">
        <p className="hint">Familia săptămânii va apărea aici.</p>
      </div>
    </>
  );
}
