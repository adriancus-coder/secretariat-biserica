import type { Metadata } from "next";

export const metadata: Metadata = { title: "Date trimise", robots: { index: false } };

/** Confirmation of the general link (no data shown: nothing is read back from the register). */
export default function GeneralSentPage() {
  return (
    <>
      <h2 className="text-2xl mb-2">Mulțumim!</h2>
      <p>Datele au fost trimise. Secretariatul le verifică înainte să ajungă în evidența bisericii.</p>
    </>
  );
}
