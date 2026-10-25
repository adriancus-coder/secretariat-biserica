"use client";

import { useEffect, useId, useRef, useState } from "react";

/** Wide screens show the preview beside the form; phones open it in a new tab (their PDF viewers are full screen). */
const WIDE = "(min-width: 820px)";
const DEBOUNCE_MS = 1000;

/**
 * "Previzualizează": posts the form as it is now (unsaved) to `action`, a /pdf/** preview route. On
 * a wide screen the PDF appears in a frame beside the form and refreshes a second after typing
 * stops; on a phone the button opens it in a new tab. Place it inside the form; the frame is
 * rendered into the element with id `frameHostId` (the form's side column).
 */
export function PreviewButton({ action, frameHostId }: { action: string; frameHostId: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const name = `preview-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // The frame lives in the side column, outside the form's fields.
  useEffect(() => {
    const host = document.getElementById(frameHostId);
    if (!host) return;
    if (!wide) {
      host.replaceChildren();
      host.hidden = true;
      return;
    }
    const frame = document.createElement("iframe");
    frame.name = name;
    frame.title = "Previzualizare PDF";
    frame.className = "preview-frame";
    host.replaceChildren(frame);
    host.hidden = false;
    return () => host.replaceChildren();
  }, [wide, name, frameHostId]);

  // A second after the last change, refresh the frame (wide screens only).
  useEffect(() => {
    const form = button.current?.form;
    if (!wide || !form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => button.current && form.requestSubmit(button.current);
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, DEBOUNCE_MS);
    };
    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);
    // First render once the editors are ready.
    timer = setTimeout(refresh, 300);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", schedule);
      form.removeEventListener("change", schedule);
    };
  }, [wide]);

  return (
    <button
      ref={button}
      type="submit"
      className="btn"
      formAction={action}
      formMethod="post"
      formTarget={wide ? name : "_blank"}
      formNoValidate
      data-native-submit=""
    >
      Previzualizează
    </button>
  );
}
