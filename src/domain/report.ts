import { memberName } from "@/lib/format";
import { EXIT_LABEL } from "@/lib/labels";
import type { Stats } from "./stats";

export interface YearActivity {
  /** Evenimente din calendar în anul raportat (toate tipurile). */
  evenimente: number;
  /** Ședințe consemnate în procese-verbale în anul raportat. */
  sedinte: number;
  /** Documente eliberate în anul raportat (fără dările de seamă). */
  documente: number;
}

/**
 * Textul dării de seamă anuale — portarea funcției `reportText(y)` din prototip, cu același
 * conținut, aceleași formulări și aceeași ordine a rândurilor.
 */
export function buildReportText(year: number, s: Stats, activity: YearActivity): string {
  const names = (list: { nume: string; prenume: string }[]) => list.map(memberName).join(", ");
  const L: string[] = [];
  L.push(`SITUAȚIA MEMBRALĂ LA 31.12.${year}, prezentată de secretar`);
  L.push("");
  L.push(`Total membri: ${s.membri.length}, din care:`);
  if (s.intrBotez.length) L.push(`  ✓ ${s.intrBotez.length} botezați în ${year} (${names(s.intrBotez)})`);
  if (s.intrTransfer.length) L.push(`  ✓ ${s.intrTransfer.length} veniți cu transfer (${names(s.intrTransfer)})`);
  if (s.reprimiri.length) L.push(`  ✓ ${s.reprimiri.length} reprimiți (${names(s.reprimiri)})`);
  L.push(`Copii ai membrilor sub 18 ani: ${s.copiiMembri.length}`);
  L.push("");
  L.push("Situația persoanelor în evidență:");
  L.push(`- ${s.copii.length} copii minori`);
  L.push(`- ${s.botezati.length} botezați, din care ${s.apart.length} aparținători`);
  L.push(`- ${s.prieteni.length} prieteni ai casei Domnului, nebotezați`);
  L.push(`- ${s.fams} familii`);
  L.push(`Total persoane în evidență: ${s.ev.length}`);
  L.push("");

  const evs: string[] = [];
  if (s.binecuv.length) {
    evs.push(
      `${s.binecuv.length === 1 ? "o binecuvântare de copil" : `${s.binecuv.length} binecuvântări de copii`} (${names(s.binecuv)})`,
    );
  }
  if (s.intrBotez.length) {
    evs.push(`${s.intrBotez.length === 1 ? "un botez nou-testamentar" : "botezuri nou-testamentare"} (${names(s.intrBotez)})`);
  }
  if (s.nunti.length) {
    evs.push(`${s.nunti.length === 1 ? "o nuntă" : `${s.nunti.length} nunți`} (${s.nunti.map((e) => e.titlu).join(", ")})`);
  }
  if (s.inmorm.length) {
    evs.push(
      `${s.inmorm.length === 1 ? "o înmormântare" : `${s.inmorm.length} înmormântări`} (${s.inmorm.map((e) => e.titlu).join(", ")})`,
    );
  }
  if (evs.length) L.push(`În anul ${year} ${evs.length > 1 ? "au avut loc" : "a avut loc"}: ${evs.join("; ")}.`);

  if (s.iesiri.length) {
    L.push(
      `Ieșiri din evidență în ${year}: ${s.iesiri
        .map(
          (p) =>
            `${memberName(p)} (${p.modIesire ? EXIT_LABEL[p.modIesire] : "ieșire"}${p.bisericaDestinatie ? `, ${p.bisericaDestinatie}` : ""})`,
        )
        .join(", ")}.`,
    );
  }
  L.push("");
  L.push(
    `Activitate: ${activity.evenimente} evenimente înregistrate în calendar, ${activity.sedinte} ședințe consemnate în procese-verbale, ${activity.documente} documente eliberate.`,
  );
  return L.join("\n");
}
