import type { MetadataRoute } from "next";

/**
 * The web app manifest (installable app). Shortcuts a role cannot use land on the usual
 * "Acces restricționat" page; nothing personal is in here.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Secretariat Biserică",
    short_name: "Secretariat",
    description: "Secretariatul bisericii: registrul de persoane, procese-verbale, calendar, documente și dare de seamă.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Portrait first; the app still rotates (no forced lock beyond the preference).
    orientation: "portrait-primary",
    theme_color: "#1B2843",
    background_color: "#FBFAF6",
    lang: "ro",
    dir: "ltr",
    categories: ["productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Persoane", url: "/persoane", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Ședință nouă", url: "/procese-verbale/nou", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "De semnat", short_name: "De semnat", description: "Documente care așteaptă semnătura pastorului", url: "/documente/de-semnat", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
