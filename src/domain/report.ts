import { memberName } from "@/lib/format";
import { normalizeSearch } from "@/lib/text";
import { EXIT_LABEL, PRIETENI_TITLE } from "@/lib/labels";
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
export function buildReportText(year: number, s: Stats, activity: YearActivity, churchName = ""): string {
  const names = (list: { nume: string; prenume: string }[]) => list.map(memberName).join(", ");
  // Not in the prototype: a baptism in another church is followed by "(<biserica>, <oficiant>)".
  const here = churchKey(churchName);
  const baptised = (list: Stats["intrBotez"]) =>
    list
      .map((p) => {
        const other = p.botezBiserica.trim() && churchKey(p.botezBiserica) !== here;
        return other ? `${memberName(p)} (${[p.botezBiserica.trim(), p.botezOficiant.trim()].filter(Boolean).join(", ")})` : memberName(p);
      })
      .join(", ");
  const L: string[] = [];
  L.push(`SITUAȚIA MEMBRALĂ LA 31.12.${year}, prezentată de secretar`);
  L.push("");
  L.push(`Total membri: ${s.membri.length}, din care:`);
  if (s.intrBotez.length) L.push(`  ✓ ${s.intrBotez.length} botezați în ${year} (${baptised(s.intrBotez)})`);
  if (s.intrTransfer.length) L.push(`  ✓ ${s.intrTransfer.length} veniți cu transfer (${names(s.intrTransfer)})`);
  if (s.reprimiri.length) L.push(`  ✓ ${s.reprimiri.length} reprimiți (${names(s.reprimiri)})`);
  L.push("");
  // Statut art. 28 (documented deviation from the prototype's lines, see statuteBlock in the parity test).
  L.push("Situația persoanelor în evidență:");
  L.push(
    `- Aparținători: ${s.apart.length} (din care a) minori nebotezați din familii de credincioși: ${s.apartA.length}; b) persoane nebotezate hotărâte: ${s.apartB.length})`,
  );
  L.push(`- Botezați fără calitate de membru: ${s.botezatiFara.length}`);
  L.push(`- ${PRIETENI_TITLE}: ${s.prieteni.length}`);
  L.push(`- Copii minori: ${s.copii.length} (din care copii ai membrilor: ${s.copiiMembri.length}, copii din alte familii: ${s.copiiAlte.length})`);
  // Not in the prototype: the adults' marital status (documented with the persons block in the parity test).
  L.push(`- Adulți: ${s.adulti.length} (căsătoriți ${s.casatoriti.length}, necăsătoriți ${s.necasatoriti.length}, necompletat ${s.stareCivilaNecompletata.length})`);
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
    evs.push(`${s.intrBotez.length === 1 ? "un botez nou-testamentar" : "botezuri nou-testamentare"} (${baptised(s.intrBotez)})`);
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

/** "Biserica Maranata Stavanger" and "maranata stavanger" are the same church. */
function churchKey(name: string): string {
  return normalizeSearch(name).replace(/^biserica\s+/, "");
}
