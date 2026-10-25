import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { lineDiff } from "@/lib/line-diff";
import { privacyTemplate } from "@/lib/privacy";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";
import { todayIso } from "@/lib/dates";
import { adoptPrivacyModelAction } from "@/server/actions/settings";
import { getChurch } from "@/server/queries/church";
import { requireCtx } from "@/server/session";

export const metadata: Metadata = { title: "Nota de informare" };

/** "Vezi diferențele": the church's published notice next to the new model (administrators). */
export default async function PrivacyModelPage() {
  const ctx = await requireCtx("admin");
  const church = await getChurch(ctx);
  const current = church.privacyText.trim() || privacyTemplate(church);
  const next = privacyTemplate({ ...church, privacyAdoptedAt: todayIso() });
  const diff = lineDiff(current, next);
  return (
    <>
      <BackLink href="/setari">Setări</BackLink>
      <PageHead title={`Modelul notei de informare (${PRIVACY_NOTICE_VERSION})`} sub="Rândurile scoase sunt tăiate, cele noi sunt evidențiate" />
      <div className="card diff scroll-panel">
        {diff.map((d, i) =>
          d.op === "same" ? (
            <p key={i}>{d.text || " "}</p>
          ) : d.op === "add" ? (
            <p key={i} className="diff-add">
              <span className="sr-only">Adăugat: </span>
              {d.text || " "}
            </p>
          ) : (
            <p key={i} className="diff-del">
              <span className="sr-only">Scos: </span>
              {d.text || " "}
            </p>
          ),
        )}
      </div>
      <form action={adoptPrivacyModelAction} className="actions">
        <div className="spacer" />
        <button type="submit" className="btn btn-primary">
          Folosește modelul nou
        </button>
      </form>
      <p className="hint">Textul propriu al bisericii este înlocuit doar dacă alegeți „Folosește modelul nou”.</p>
    </>
  );
}
