import { privacyBlocks } from "@/lib/privacy";

/** The notice as headings and paragraphs (plain text, never HTML). */
export function PrivacyText({ text }: { text: string }) {
  return (
    <div className="privacy">
      {privacyBlocks(text).map((b, i) =>
        b.type === "h" ? (
          <h3 key={i} className="text-lg mt-5 mb-1">
            {b.text}
          </h3>
        ) : b.type === "li" ? (
          <p key={i} className="mb-2 pl-4 -indent-3">
            • {b.text}
          </p>
        ) : (
          <p key={i} className="mb-3">
            {b.text}
          </p>
        ),
      )}
    </div>
  );
}
