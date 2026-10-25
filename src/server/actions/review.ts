"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { idSchema, longText } from "@/lib/validation";
import { applyDecision } from "../review";
import { actionCtx } from "../session";
import { parseOrThrow, runFormAction } from "./run";

/** "De verificat": accept everything, the checked fields, or reject with a note (see applyDecision). */
export async function decideSubmissionAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  let done = false;
  const state = await runFormAction(formData, async () => {
    const ctx = await actionCtx("write");
    parseOrThrow(idSchema, id);
    await applyDecision(ctx, id, {
      decizie: String(formData.get("decizie") ?? ""),
      nota: parseOrThrow(longText(1000, "Nota"), formData.get("nota") ?? ""),
      chosen: new Set([...formData.keys()].filter((k) => /^[scn]:/.test(k))),
      persoana: formData.has("persoana") ? String(formData.get("persoana")) : null,
    });
    done = true;
  });
  if (!done) return state;
  revalidatePath("/", "layout");
  redirect("/de-verificat?salvat=1");
}
