import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-ext-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-ext-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-ext-600.css";
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-ext-400.css";
import "@fontsource/source-serif-4/latin-600.css";
import "@fontsource/source-serif-4/latin-ext-600.css";
import "./globals.css";
import { TEXT_SIZE_COOKIE, parseUiTextSize } from "@/lib/text-size";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { PwaRegister } from "@/components/pwa/pwa-register";
import { EmptyDateMarker } from "@/components/ui/empty-date-marker";

export const metadata: Metadata = {
  title: { default: "Secretariat", template: "%s · Secretariat" },
  description: "Secretariatul bisericii: registrul de persoane, procese-verbale, calendar, documente și dare de seamă.",
  robots: { index: false, follow: false },
  applicationName: "Secretariat Biserică",
  // Installed on an iPhone / iPad home screen: full screen, the app's name, status bar over the navy header.
  appleWebApp: { capable: true, title: "Secretariat", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1B2843",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const textSize = parseUiTextSize(jar.get(TEXT_SIZE_COOKIE)?.value);
  return (
    <html lang="ro" data-theme={theme === "auto" ? undefined : theme} data-text-size={textSize === "100" ? undefined : textSize}>
      <body>
        {children}
        <PwaRegister />
        <EmptyDateMarker />
      </body>
    </html>
  );
}
