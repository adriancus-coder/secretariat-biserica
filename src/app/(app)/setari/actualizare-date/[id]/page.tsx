import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/ui/copy-button";
import { AutoSubmitSelect } from "@/components/ui/auto-submit-select";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { ShareButton } from "@/components/ui/share-button";
import { campaignMessage, LINK_STATUS_LABEL, LINK_STATUSES, type LinkStatus } from "@/lib/campaign";
import { fmt, memberName } from "@/lib/format";
import { DataTable } from "@/components/ui/data-table";
import { permissions } from "@/lib/permissions";
import { idSchema } from "@/lib/validation";
import { addMissingLinksAction, closeCampaignAction, markLinkSentAction, renewLinkAction, toggleGeneralLinkAction } from "@/server/actions/campaigns";
import { applicationQrPng, applicationQrSvg } from "@/server/application-link";
import { getCampaign } from "@/server/queries/campaigns";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";
import { loadConsentStates } from "@/server/consents";
import { categoryHref } from "@/lib/category-params";
import { consentKey } from "@/domain/categories";
import { CONSENT_KINDS, CONSENT_LABEL, OPTIONAL_CONSENTS, type ConsentKindKey } from "@/lib/labels";

export const metadata: Metadata = { title: "Actualizare date" };

const ANSWERED: readonly LinkStatus[] = ["COMPLETAT", "APROBAT"];

/** One campaign: the adults with their personal links and statuses (secretariat). */
export default async function CampaignPage({ params, searchParams }: PageProps<"/setari/actualizare-date/[id]">) {
  const ctx = await requireCtx("write");
  const { id } = await params;
  const sp = await searchParams;
  if (!idSchema.safeParse(id).success) notFound();
  const [c, church] = await Promise.all([getCampaign(ctx, id), getChurch(ctx)]);
  if (!c) notFound();
  const isAdmin = permissions.admin(ctx.user.role);
  const filter = (LINK_STATUSES as readonly string[]).includes(String(sp.stare)) ? (sp.stare as LinkStatus) : null;
  const noPhone = sp.stare === "fara-telefon";
  const counts = Object.fromEntries(LINK_STATUSES.map((s) => [s, c.links.filter((l) => l.status === s).length])) as Record<LinkStatus, number>;
  const answered = c.links.filter((l) => ANSWERED.includes(l.status)).length;
  const shown = c.links.filter((l) => (noPhone ? !l.telefon.trim() : filter ? l.status === filter : true));
  const allLinks = c.links.map((l) => `${memberName(l)} — ${l.telefon || "fără telefon"} — ${l.url}`).join("\n");
  // Totals per consent over the persons in the record (each number opens its list).
  const inRecord = await ctx.db.person.findMany({ where: { dataIesire: null, statut: { not: "FOST_MEMBRU" } }, select: { id: true } });
  const states = await loadConsentStates(ctx, inRecord.map((p) => p.id));
  const tally = (kind: ConsentKindKey) => {
    const t = { da: 0, nu: 0, neexprimat: 0 };
    for (const p of inRecord) {
      const st = states.get(p.id)?.[kind];
      if (st === "DA") t.da++;
      else if (st === "NU" || st === "RETRAS") t.nu++;
      else t.neexprimat++;
    }
    return t;
  };
  const exportHref = `/persoane/export?categorie=toti&${["nume", "prenume", "statut", ...CONSENT_KINDS.map((k) => `acord_${k}`)].map((col) => `coloane=${col}`).join("&")}`;
  const qrSvg = c.generalUrl ? await applicationQrSvg(c.generalUrl) : null;
  const qrPng = c.generalUrl ? `data:image/png;base64,${(await applicationQrPng(c.generalUrl)).toString("base64")}` : null;
  return (
    <>
      <BackLink href="/setari/actualizare-date">Actualizare date</BackLink>
      <PageHead title={c.nume} sub={`${c.status === "ACTIVE" ? "Activă" : "Închisă"} · până la ${fmt(c.deadline)} · ${answered} din ${c.links.length} au răspuns`}>
        {isAdmin && c.status === "ACTIVE" ? (
          <form action={closeCampaignAction.bind(null, c.id)}>
            <button type="submit" className="btn">
              Închide campania
            </button>
          </form>
        ) : null}
      </PageHead>

      <div className="card">
        <h3>Link general cu cod QR</h3>
        {c.generalUrl ? (
          <div className="flex flex-wrap gap-4 items-start">
            <div className="qr" aria-label="Cod QR" dangerouslySetInnerHTML={{ __html: qrSvg! }} />
            <div className="grid gap-2 min-w-0">
              <span className="break-all text-sm">{c.generalUrl}</span>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={c.generalUrl} label="Copiază linkul" />
                <a href={qrPng!} download="cod-qr-actualizare-date.png" className="btn btn-sm">
                  Descarcă PNG
                </a>
                <a href={`/pdf/afis-actualizare/${c.id}`} target="_blank" rel="noopener" className="btn btn-sm">
                  Afiș A5 (PDF)
                </a>
              </div>
              <p className="hint">Formularul se deschide gol pentru oricine; răspunsurile ajung la „De verificat”.</p>
            </div>
          </div>
        ) : (
          <p className="hint">Linkul general este oprit.</p>
        )}
        {isAdmin && c.status === "ACTIVE" ? (
          <form action={toggleGeneralLinkAction.bind(null, c.id)} className="mt-2">
            <button type="submit" className="btn btn-sm">
              {c.generalUrl ? "Oprește linkul general" : "Pornește linkul general"}
            </button>
          </form>
        ) : null}
      </div>

      <div className="card">
        <h3>Situația acordurilor</h3>
        <DataTable
          id="acorduri"
          caption="Situația acordurilor"
          columns={[
            { key: "acord", label: "Acord", type: "text" },
            { key: "da", label: "Da", type: "number" },
            { key: "nu", label: "Nu", type: "number" },
            { key: "neexprimat", label: "Neexprimat", type: "number" },
          ]}
          rows={[
            {
              key: "INFO_NOTE",
              sort: [CONSENT_LABEL.INFO_NOTE, tally("INFO_NOTE").da, null, inRecord.length - tally("INFO_NOTE").da],
              cells: [
                CONSENT_LABEL.INFO_NOTE,
                <Link key="da" className="num-link" href={categoryHref("nota-confirmata", undefined)}>
                  {tally("INFO_NOTE").da}
                </Link>,
                "—",
                <Link key="ne" className="num-link" href={categoryHref("nota-neconfirmata", undefined)}>
                  {inRecord.length - tally("INFO_NOTE").da}
                </Link>,
              ],
            },
            ...OPTIONAL_CONSENTS.map((k) => {
              const t = tally(k);
              return {
                key: k,
                sort: [CONSENT_LABEL[k], t.da, t.nu, t.neexprimat],
                cells: [
                  CONSENT_LABEL[k],
                  ...(["da", "nu", "neexprimat"] as const).map((a) => (
                    <Link key={a} className="num-link" href={categoryHref(consentKey(k, a), undefined)}>
                      {t[a]}
                    </Link>
                  )),
                ],
              };
            }),
          ]}
        />
        {permissions.export(ctx.user.role) ? (
          <Link href={exportHref} className="btn btn-sm mt-2">
            Exportă situația acordurilor
          </Link>
        ) : null}
      </div>

      <form method="get" className="toolbar items-center">
        <label htmlFor="stare" className="sr-only">
          Starea
        </label>
        <AutoSubmitSelect id="stare" name="stare" defaultValue={noPhone ? "fara-telefon" : (filter ?? "")} className="!w-auto !flex-none">
          <option value="">Toți ({c.links.length})</option>
          {LINK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LINK_STATUS_LABEL[s]} ({counts[s]})
            </option>
          ))}
          <option value="fara-telefon">Fără telefon ({c.links.filter((l) => !l.telefon.trim()).length})</option>
        </AutoSubmitSelect>
        <noscript>
          <button type="submit" className="btn btn-sm">
            Arată
          </button>
        </noscript>
      </form>

      <div className="flex flex-wrap gap-2 mb-3">
        <CopyButton text={allLinks} label="Copiază toate linkurile ca listă" />
        {c.status === "ACTIVE" ? (
          <form action={addMissingLinksAction.bind(null, c.id)}>
            <button type="submit" className="btn btn-sm">
              Adaugă persoanele noi
            </button>
          </form>
        ) : null}
      </div>

      <ul className="list campaign-list">
        {shown.map((l) => {
          const message = campaignMessage(l.prenume, church.nume, c.deadline, l.url);
          return (
            <li key={l.id} className="item campaign-row">
              <div className="grow min-w-0">
                <Link href={`/persoane/${l.personId}`}>
                  <b>{memberName(l)}</b>
                </Link>{" "}
                <span className={l.status === "BLOCAT" ? "tag tag-warn" : ANSWERED.includes(l.status) ? "tag tag-ok" : "tag"}>{LINK_STATUS_LABEL[l.status]}</span>
                {!l.telefon.trim() ? (
                  <span className="hint block">fără telefon — nu poate trece verificarea; folosiți hârtia sau completați telefonul</span>
                ) : null}
              </div>
              {c.open ? (
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={l.url} label="Copiază linkul" />
                  <ShareButton title="Actualizarea datelor" text={message} />
                  <CopyButton text={message} label="Copiază mesajul" />
                  <form action={markLinkSentAction.bind(null, l.id)}>
                    <button type="submit" className="btn btn-sm">
                      Marchează ca trimis
                    </button>
                  </form>
                  <form action={renewLinkAction.bind(null, l.id)}>
                    <button type="submit" className="btn btn-sm">
                      {l.status === "BLOCAT" ? "Deblochează / generează link nou" : "Generează link nou"}
                    </button>
                  </form>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
