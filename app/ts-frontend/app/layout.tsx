import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import "@fontsource/comic-neue/400.css";
import "@fontsource/comic-neue/700.css";
import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/merriweather/400.css";
import "@fontsource/merriweather/700.css";
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/600.css";
import "@fontsource/open-sans/700.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "./globals.css";
import { getRequestDictionary } from "../lib/i18n/server";
import { GlobalButtonClickSound } from "./global-button-click-sound";
import { GlobalPendingButtonState } from "./global-pending-button-state";
import { GlobalToastHost } from "./global-toast-host";
import { PublicAnalytics } from "./public-analytics";

export async function generateMetadata(): Promise<Metadata> {
  const { dictionary } = await getRequestDictionary();

  return {
    metadataBase: new URL("https://www.treehomeschool.com"),
    title: dictionary.metadata.title,
    description: dictionary.metadata.description,
    alternates: {
      types: {
        "application/rss+xml": "https://www.treehomeschool.com/blog/rss.xml"
      }
    }
  };
}

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default async function RootLayout({ children }: RootLayoutProps) {
  const headerStore = await headers();
  const countryCode =
    headerStore.get("x-treeschool-ip-country") ??
    headerStore.get("x-vercel-ip-country") ??
    headerStore.get("cf-ipcountry");

  return (
    <html lang="en">
      <body>
        <GlobalButtonClickSound />
        <GlobalPendingButtonState />
        <Suspense fallback={null}>
          <GlobalToastHost />
          <PublicAnalytics countryCode={countryCode} />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
