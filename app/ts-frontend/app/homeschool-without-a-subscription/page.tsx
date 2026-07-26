import type { Metadata } from "next";
import { MarketingFunnelPage } from "../../components/marketing-funnel-page";
import { noSubscriptionHomeschoolConfig } from "../../lib/marketing/funnel-configs";

export const metadata: Metadata = {
  title: "Homeschool Without a Subscription | Treeschool",
  description:
    "Buy printable homeschool workbooks and curriculum bundles as one-time purchases without a recurring Treeschool membership.",
  alternates: {
    canonical: "/homeschool-without-a-subscription"
  },
  openGraph: {
    title: "Homeschool Without Another Subscription",
    description: "One-time printable homeschool workbooks and curriculum bundles with no automatic renewal.",
    type: "website",
    url: "/homeschool-without-a-subscription",
    images: [
      {
        url: "https://www.treehomeschool.com/funnel-social-preview.png",
        width: 1731,
        height: 909,
        alt: "A paper-first homeschool, built around your family."
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Homeschool Without Another Subscription",
    description: "One-time printable homeschool workbooks and curriculum bundles with no automatic renewal.",
    images: ["https://www.treehomeschool.com/funnel-social-preview.png"]
  }
};

export default function HomeschoolWithoutSubscriptionPage() {
  return <MarketingFunnelPage config={noSubscriptionHomeschoolConfig} />;
}
