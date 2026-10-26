"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { FormState } from "@/lib/form-state";
import { PHOTO_ACCEPT, PHOTOS_PER_ASSET } from "@/lib/asset-photos";
import { addAssetPhotoAction, deleteAssetPhotoAction, makeMainAssetPhotoAction } from "@/server/actions/asset-photos";

export interface PhotoItem {
  id: string;
  width: number;
  height: number;
}

const src = (id: string, v: "thumb" | "full") => `/api/patrimoniu/poze/${id}?v=${v}`;

/**
 * The photos of a good (PATRIMONY-PHOTOS): thumbnails; a tap opens the large photo. Write roles add one
 * with the camera ("Fă o poză", capture) or from the gallery, make one the main photo or delete it (an
 * in-app confirmation). The file is re-encoded on the server, its metadata removed.
 */
export function AssetPhotos({ assetId, photos, canWrite, denumire }: { assetId: string; photos: PhotoItem[]; canWrite: boolean; denumire: string }) {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const run = (f: () => Promise<FormState>, after?: () => void) =>
    start(async () => {
      const r = await f();
      setState(r);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  const upload = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("poza", file);
    run(() => addAssetPhotoAction(assetId, fd));
    if (input) input.value = "";
  };
  const full = photos.length >= PHOTOS_PER_ASSET;
  // Escape closes the large photo.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const index = open ? photos.findIndex((p) => p.id === open) : -1;
  return (
    <section className="card" aria-labelledby="poze">
      <h3 id="poze">Poze ({photos.length} din {PHOTOS_PER_ASSET})</h3>
      {photos.length ? (
        <ul className="asset-thumbs">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" className="asset-thumb" onClick={() => (setOpen(p.id), setConfirm(false))} aria-label={`Deschide poza ${i + 1}${i === 0 ? " (principală)" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(p.id, "thumb")} alt={`${denumire}, poza ${i + 1}`} loading="lazy" width={160} height={160} />
                {i === 0 ? <span className="tag">principală</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint !mt-0">Nicio poză încă.</p>
      )}
      {state.message ? (
        <div className={`alert mt-2 ${state.ok ? "alert-ok" : ""}`} role="status">
          {state.message}
        </div>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2 mt-3">
          <input ref={camera} type="file" accept={PHOTO_ACCEPT} capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => upload(e.currentTarget)} />
          <input ref={gallery} type="file" accept={PHOTO_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => upload(e.currentTarget)} />
          <button type="button" className="btn" disabled={pending || full} onClick={() => camera.current?.click()}>
            + Adaugă poză (cameră)
          </button>
          <button type="button" className="btn" disabled={pending || full} onClick={() => gallery.current?.click()}>
            Alege din galerie
          </button>
          {pending ? <span className="hint !mt-0 self-center">Se încarcă…</span> : null}
          <p className="hint w-full !mt-0">JPEG, PNG sau WebP, cel mult 15 MB. Poza se micșorează, iar datele ascunse (locul, data, telefonul) se șterg.</p>
        </div>
      ) : null}
      {open && index >= 0 ? (
        <div className="photo-overlay" role="dialog" aria-modal="true" aria-label={`${denumire}, poza ${index + 1}`} onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="photo-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src(open, "full")} alt={`${denumire}, poza ${index + 1}`} width={photos[index].width} height={photos[index].height} />
            <div className="flex flex-wrap gap-2 mt-3">
              {canWrite && index > 0 ? (
                <button type="button" className="btn" disabled={pending} onClick={() => run(() => makeMainAssetPhotoAction(open), () => setOpen(null))}>
                  Fă poză principală
                </button>
              ) : null}
              {canWrite && !confirm ? (
                <button type="button" className="btn" disabled={pending} onClick={() => setConfirm(true)}>
                  Șterge poza
                </button>
              ) : null}
              {canWrite && confirm ? (
                <>
                  <span className="self-center">Ștergeți poza?</span>
                  <button type="button" className="btn btn-danger" disabled={pending} onClick={() => run(() => deleteAssetPhotoAction(open), () => setOpen(null))}>
                    Da, șterge
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirm(false)}>
                    Nu
                  </button>
                </>
              ) : null}
              <button type="button" className="btn ml-auto" onClick={() => setOpen(null)}>
                Închide
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
