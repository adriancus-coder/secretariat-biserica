/**
 * The built-in privacy notice of a church (Romanian; a template the administrator edits in Setări →
 * Organizația). Lines starting with "## " are headings; blank lines separate paragraphs. Pure.
 */
export function privacyTemplate(c: { nume: string; email: string; adresa: string }): string {
  const church = c.nume ? `Biserica ${c.nume}` : "Biserica";
  const contact = c.email || "[adresa de e-mail a bisericii]";
  return [
    `## Cine prelucrează datele`,
    `${church}${c.adresa ? `, cu sediul în ${c.adresa}` : ""}, este operatorul datelor personale din evidența membrilor. Pentru orice întrebare privind datele dumneavoastră ne puteți scrie la ${contact}.`,
    ``,
    `## Ce date păstrăm`,
    `Numele, data nașterii, genul, datele de contact (telefon, e-mail, adresă), familia și gradul de rudenie, datele intrării în biserică (botez, transfer, binecuvântare), funcțiile și slujirile, prezența la ședințe, precum și documentele eliberate la cererea dumneavoastră.`,
    ``,
    `## De ce și pe ce temei`,
    `Datele sunt prelucrate pentru evidența membrilor și viața bisericii (ședințe, evenimente, documente, darea de seamă anuală), în cadrul activităților legitime ale unei organizații religioase fără scop lucrativ, față de membrii și persoanele aflate în contact regulat cu ea (art. 9 alin. 2 lit. d din Regulamentul (UE) 2016/679), și, pentru cererile online, pe baza acordului dumneavoastră.`,
    ``,
    `## Cine are acces`,
    `Doar persoanele desemnate de biserică (pastorul, secretariatul și administratorii aplicației), fiecare cu drepturile rolului său. Datele nu sunt vândute și nu sunt folosite pentru reclame. Aplicația este găzduită de furnizori de servicii (găzduire, e-mail), care prelucrează datele doar în numele bisericii.`,
    ``,
    `## Cât timp`,
    `Cât timp sunteți în evidența bisericii și apoi atât cât cer obligațiile legale și istoria bisericii (de exemplu registrele de botez). Puteți cere oricând ștergerea sau anonimizarea datelor care nu mai sunt necesare.`,
    ``,
    `## Drepturile dumneavoastră`,
    `Aveți dreptul de acces, rectificare, ștergere, restricționare, opoziție și portabilitate, precum și dreptul de a vă retrage acordul. Scrieți-ne la ${contact}. Aveți și dreptul de a depune o plângere la autoritatea de protecție a datelor din țara în care locuiți.`,
  ].join("\n");
}

export type PrivacyBlock = { type: "h"; text: string } | { type: "p"; text: string };

/** "## Titlu" → heading; other non-empty lines (joined until a blank line) → paragraph. */
export function privacyBlocks(text: string): PrivacyBlock[] {
  const out: PrivacyBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flush();
      out.push({ type: "h", text: line.slice(3).trim() });
    } else if (!line) flush();
    else para.push(line);
  }
  flush();
  return out;
}
