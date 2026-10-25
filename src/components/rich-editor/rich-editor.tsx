"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { ALIGN_LABEL, ALIGNS, emptyRich, TEXT_SIZE_LABEL, TEXT_SIZES, type Align, type RichDoc, type TextSize } from "@/lib/rich-text";
import { richExtensions } from "./extensions";

export interface RichEditorHandle {
  /** Replaces the whole content ("Regenerează din șablon"). */
  setContent(doc: RichDoc): void;
  focus(): void;
}

/**
 * The shared rich-text editor (Tiptap): a small sticky toolbar — Îngroșat, Înclinat, Subliniat,
 * Mărime, Aliniere, liste, Anulează / Refă, Șterge formatarea — over an editable area. The document
 * travels as JSON in the hidden input `name`; the server validates it again.
 */
export function RichEditor({
  name,
  initial,
  label,
  id,
  invalid,
  minRows = 6,
  compact,
  onChange,
  editorRef,
}: {
  name: string;
  initial: RichDoc | null;
  /** Accessible name of the editable area. */
  label: string;
  id?: string;
  invalid?: boolean;
  /** Approximate height in lines. */
  minRows?: number;
  /** Fewer controls (no alignment or lists): a short line such as one minutes point. */
  compact?: boolean;
  onChange?: (doc: RichDoc) => void;
  editorRef?: Ref<RichEditorHandle>;
}) {
  const [json, setJson] = useState(() => JSON.stringify(initial ?? emptyRich()));
  const wrapper = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: richExtensions,
    content: initial ?? emptyRich(),
    // Rendered on the client only (the form pages are dynamic): no hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "rt-content font-serif",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(id ? { id } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
        style: `min-height: ${minRows * 1.6}em`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const doc = ed.getJSON() as RichDoc;
      setJson(JSON.stringify(doc));
      onChangeRef.current?.(doc);
      // The preview frame and the unsaved-changes guard listen for input events on the form.
      wrapper.current?.dispatchEvent(new Event("input", { bubbles: true }));
    },
  });

  useImperativeHandle(
    editorRef,
    () => ({
      setContent(doc: RichDoc) {
        if (!editor) return;
        editor.commands.setContent(doc, { emitUpdate: true });
      },
      focus() {
        editor?.commands.focus();
      },
    }),
    [editor],
  );

  // With the on-screen keyboard open (iOS Safari), keep the toolbar at the top of the visible area.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = wrapper.current;
    if (!vv || !el) return;
    const place = () => el.style.setProperty("--rt-top", `${Math.max(0, Math.round(vv.offsetTop))}px`);
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    place();
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, []);

  return (
    <div ref={wrapper} className={`rt${invalid ? " rt-invalid" : ""}`}>
      <input type="hidden" name={name} value={json} />
      <Toolbar editor={editor} compact={compact} />
      {editor ? <EditorContent editor={editor} /> : <div className="rt-content rt-loading font-serif" style={{ minHeight: `${minRows * 1.6}em` }} aria-hidden="true" />}
    </div>
  );
}

function Toolbar({ editor, compact }: { editor: Editor | null; compact?: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive("bold"),
            italic: ed.isActive("italic"),
            underline: ed.isActive("underline"),
            size: ((ed.getAttributes("textSize").size as TextSize | undefined) ?? "normal") as TextSize,
            align: ((ed.getAttributes("paragraph").align as Align | null) ?? null) as Align | null,
            ordered: ed.isActive("orderedList"),
            bullet: ed.isActive("bulletList"),
            canUndo: ed.can().undo(),
            canRedo: ed.can().redo(),
          }
        : null,
  });
  const run = (fn: (ed: Editor) => void) => () => {
    if (editor) fn(editor);
  };
  const disabled = !editor;

  return (
    <div className="rt-toolbar" role="toolbar" aria-label="Formatare text">
      <Tool label="Îngroșat" pressed={s?.bold} disabled={disabled} onClick={run((ed) => ed.chain().focus().toggleBold().run())}>
        <b>B</b>
      </Tool>
      <Tool label="Înclinat" pressed={s?.italic} disabled={disabled} onClick={run((ed) => ed.chain().focus().toggleItalic().run())}>
        <i className="font-serif">I</i>
      </Tool>
      <Tool label="Subliniat" pressed={s?.underline} disabled={disabled} onClick={run((ed) => ed.chain().focus().toggleUnderline().run())}>
        <u>U</u>
      </Tool>
      <select
        className="rt-size"
        aria-label="Mărime"
        title="Mărime"
        value={s?.size ?? "normal"}
        disabled={disabled}
        onChange={(e) => {
          const size = e.target.value as TextSize;
          if (!editor) return;
          if (size === "normal") editor.chain().focus().unsetMark("textSize").run();
          else editor.chain().focus().setMark("textSize", { size }).run();
        }}
      >
        {TEXT_SIZES.map((t) => (
          <option key={t} value={t}>
            {TEXT_SIZE_LABEL[t]}
          </option>
        ))}
      </select>
      {compact ? null : (
        <>
          <span className="rt-sep" aria-hidden="true" />
          {ALIGNS.map((a) => (
            <Tool
              key={a}
              label={`Aliniere ${ALIGN_LABEL[a]}`}
              pressed={(s?.align ?? "") === a}
              disabled={disabled}
              onClick={run((ed) => ed.chain().focus().updateAttributes("paragraph", { align: (s?.align ?? null) === a ? null : a }).run())}
            >
              <AlignIcon align={a} />
            </Tool>
          ))}
          <span className="rt-sep" aria-hidden="true" />
          <Tool label="Listă numerotată" pressed={s?.ordered} disabled={disabled} onClick={run((ed) => ed.chain().focus().toggleOrderedList().run())}>
            <ListIcon ordered />
          </Tool>
          <Tool label="Listă cu puncte" pressed={s?.bullet} disabled={disabled} onClick={run((ed) => ed.chain().focus().toggleBulletList().run())}>
            <ListIcon />
          </Tool>
        </>
      )}
      <span className="rt-sep" aria-hidden="true" />
      <Tool label="Anulează" disabled={disabled || !s?.canUndo} onClick={run((ed) => ed.chain().focus().undo().run())}>
        <Svg>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </Svg>
      </Tool>
      <Tool label="Refă" disabled={disabled || !s?.canRedo} onClick={run((ed) => ed.chain().focus().redo().run())}>
        <Svg>
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H10a6 6 0 0 0 0 12h3" />
        </Svg>
      </Tool>
      <Tool
        label="Șterge formatarea"
        disabled={disabled}
        onClick={run((ed) => ed.chain().focus().unsetAllMarks().updateAttributes("paragraph", { align: null }).run())}
      >
        <Svg>
          <path d="M5 5h11M10.5 5 7 19" />
          <path d="m14 14 6 6M20 14l-6 6" />
        </Svg>
      </Tool>
    </div>
  );
}

function Tool({ label, pressed, disabled, onClick, children }: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="rt-tool"
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      // Keep the selection in the editor (the button must not take the focus on mouse down).
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function AlignIcon({ align }: { align: Align }) {
  const rows: [number, number][] =
    align === "left"
      ? [[4, 20], [4, 14], [4, 18], [4, 12]]
      : align === "center"
        ? [[4, 20], [7, 17], [5, 19], [8, 16]]
        : align === "right"
          ? [[4, 20], [10, 20], [6, 20], [12, 20]]
          : [[4, 20], [4, 20], [4, 20], [4, 14]];
  return (
    <Svg>
      {rows.map(([x1, x2], i) => (
        <path key={i} d={`M${x1} ${6 + i * 4}H${x2}`} />
      ))}
    </Svg>
  );
}

function ListIcon({ ordered }: { ordered?: boolean }) {
  return (
    <Svg>
      <path d="M10 6h10M10 12h10M10 18h10" />
      {ordered ? (
        <text x="2" y="9" fontSize="7" fill="currentColor" stroke="none">
          1
        </text>
      ) : (
        <>
          <circle cx="5" cy="6" r="1.3" fill="currentColor" />
          <circle cx="5" cy="12" r="1.3" fill="currentColor" />
          <circle cx="5" cy="18" r="1.3" fill="currentColor" />
        </>
      )}
    </Svg>
  );
}
