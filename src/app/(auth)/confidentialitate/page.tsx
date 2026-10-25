import type { Metadata } from "next";
import { privacyTemplate } from "@/lib/privacy";
import { PrivacyText } from "./privacy-text";

export const metadata: Metadata = { title: "Confidențialitate" };

/** Public: the general notice (each church has its own at /confidentialitate/<adresa-bisericii>). */
export default function PrivacyPage() {
  return (
    <>
      <h2 className="text-2xl mb-1">Confidențialitatea datelor</h2>
      <p className="hint mb-4">Fiecare biserică își publică textul propriu; mai jos este modelul general.</p>
      <PrivacyText text={privacyTemplate({ nume: "", email: "", adresa: "" })} />
    </>
  );
}
