"use client";

import { useActionState, useState } from "react";
import { SelectField, TextField } from "@/components/ui/fields";
import { FormMessage } from "@/components/ui/form-bits";
import { SUBCATEGORY_NAME_MAX, usedText } from "@/lib/asset-subcategories";
import { initialFormState } from "@/lib/form-state";
import { deleteSubcategoryAction, moveSubcategoryAction, saveSubcategoryAction } from "@/server/actions/asset-subcategories";

export interface SubcategoryItem {
  id: string;
  categorie: string;
  nume: string;
  used: number;
}

/** One category with its subcategories, indented under it; „+ Subcategorie” at the end (admin). */
export function CategoryCard({ categorie, subs, canEdit, orphan = false }: { categorie: string; subs: SubcategoryItem[]; canEdit: boolean; orphan?: boolean }) {
  return (
    <section className="card" aria-label={categorie}>
      <h3>
        {categorie} {orphan ? <span className="tag tag-warn">nu mai e în nomenclator</span> : null}
      </h3>
      <div className="list subcat-list">
        {subs.map((s, i) => (
          <SubcategoryRow key={s.id} sub={s} first={i === 0} last={i === subs.length - 1} others={subs.filter((x) => x.id !== s.id)} canEdit={canEdit} />
        ))}
        {!subs.length ? <p className="hint">Nicio subcategorie.</p> : null}
      </div>
      {canEdit && !orphan ? <NewSubcategoryForm categorie={categorie} /> : null}
    </section>
  );
}

function SubcategoryRow({ sub, first, last, others, canEdit }: { sub: SubcategoryItem; first: boolean; last: boolean; others: SubcategoryItem[]; canEdit: boolean }) {
  const [saveState, save, saving] = useActionState(saveSubcategoryAction.bind(null, sub.id, null), initialFormState);
  const [moveState, move] = useActionState(async (_: unknown, fd: FormData) => moveSubcategoryAction(sub.id, fd.get("dir") === "up" ? "up" : "down"), initialFormState);
  const [delState, del, deleting] = useActionState(deleteSubcategoryAction.bind(null, sub.id), initialFormState);
  const [confirming, setConfirming] = useState(false);
  const used = usedText(sub.used);
  if (!canEdit) {
    return (
      <div className="item !cursor-default">
        <div className="body">
          <div className="t">{sub.nume}</div>
          {used ? <div className="m">{used}</div> : null}
        </div>
      </div>
    );
  }
  const error = [moveState].find((s) => s.message && !s.ok);
  return (
    <div className="item role-item !cursor-default">
      <form action={move} className="role-move">
        <button type="submit" name="dir" value="up" className="btn btn-sm btn-ghost" disabled={first} aria-label={`Mută „${sub.nume}” mai sus`}>
          ↑
        </button>
        <button type="submit" name="dir" value="down" className="btn btn-sm btn-ghost" disabled={last} aria-label={`Mută „${sub.nume}” mai jos`}>
          ↓
        </button>
      </form>
      <div className="role-edit">
        <form action={save} id={`subcat-form-${sub.id}`} noValidate>
          <TextField
            name="nume"
            label="Subcategorie"
            id={`subcat-${sub.id}`}
            defaultValue={saveState.values?.nume ?? sub.nume}
            error={saveState.errors?.nume}
            maxLength={SUBCATEGORY_NAME_MAX}
            className="!mb-0"
            hint={used ?? "Nefolosită"}
          />
        </form>
        <div className="flex gap-2 flex-wrap">
          <button type="submit" form={`subcat-form-${sub.id}`} className="btn btn-sm" disabled={saving}>
            {saving ? "Se salvează…" : "Redenumește"}
          </button>
          {!confirming ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirming(true)}>
              Șterge
            </button>
          ) : null}
        </div>
        {confirming ? (
          <form action={del} className="subcat-delete" noValidate>
            {sub.used ? (
              <SelectField
                name="mutaLa"
                id={`muta-${sub.id}`}
                label={`${used}. Mută bunurile la`}
                defaultValue=""
                error={delState.errors?.mutaLa}
                className="!mb-0"
                emptyLabel="— alegeți —"
                options={[...others.map((o) => ({ value: o.id, label: o.nume })), { value: "fara", label: "Fără subcategorie" }]}
              />
            ) : (
              <p className="m-0">Ștergeți subcategoria „{sub.nume}”?</p>
            )}
            <div className="flex gap-2 flex-wrap">
              <button type="submit" className="btn btn-sm btn-danger" disabled={deleting}>
                {deleting ? "Se șterge…" : sub.used ? "Mută bunurile și șterge" : "Da, șterge"}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>
                Renunță
              </button>
            </div>
          </form>
        ) : null}
        {saveState.message ? <FormMessage state={saveState} /> : null}
        {delState.message && !delState.errors ? <FormMessage state={delState} /> : null}
      </div>
      {error ? (
        <p className="field-error role-error" role="alert">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

function NewSubcategoryForm({ categorie }: { categorie: string }) {
  const [state, action, pending] = useActionState(saveSubcategoryAction.bind(null, null, categorie), initialFormState);
  return (
    <form action={action} noValidate key={state.ok ? state.message : "form"} className="mt-3 flex flex-wrap items-end gap-2">
      <TextField
        name="nume"
        label={`Subcategorie nouă în „${categorie}”`}
        id={`subcat-nou-${categorie}`}
        placeholder="ex. Microfoane"
        defaultValue={state.ok ? "" : (state.values?.nume ?? "")}
        error={state.errors?.nume}
        maxLength={SUBCATEGORY_NAME_MAX}
        className="!mb-0 flex-1 min-w-[12rem]"
      />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Se adaugă…" : "+ Subcategorie"}
      </button>
      {state.message && !state.errors ? <FormMessage state={state} /> : null}
    </form>
  );
}
