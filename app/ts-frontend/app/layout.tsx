import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { getRequestDictionary } from "../lib/i18n/server";
import { GlobalButtonClickSound } from "./global-button-click-sound";
import { GlobalPendingButtonState } from "./global-pending-button-state";
import { GlobalToastHost } from "./global-toast-host";

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

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <GlobalButtonClickSound />
        <GlobalPendingButtonState />
        <Suspense fallback={null}>
          <GlobalToastHost />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
