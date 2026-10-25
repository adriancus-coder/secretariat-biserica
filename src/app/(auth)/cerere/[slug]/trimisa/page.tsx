import type { Metadata } from "next";
import { Icon } from "@/components/shell/icons";

export const metadata: Metadata = { title: "Cerere trimisă" };

export default function ApplicationSentPage() {
  return (
    <div className="alert alert-ok flex gap-3 items-start" role="status">
      <Icon name="bifa" className="size-[22px] shrink-0" />
      <div>
        <b className="block mb-1">Cererea a fost trimisă.</b>
        Biserica vă va contacta.
      </div>
    </div>
  );
}
