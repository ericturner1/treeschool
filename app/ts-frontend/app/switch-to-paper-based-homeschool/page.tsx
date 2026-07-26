import type { Metadata } from "next";
import { MarketingFunnelPage } from "../../components/marketing-funnel-page";
import { switchHomeschoolConfig } from "../../lib/marketing/funnel-configs";

export const metadata: Metadata = {
  title: "Switch to a Paper-Based Homeschool Program | Treeschool",
  description:
    "Move away from an expensive or screen-heavy homeschool program without starting over. Keep progress, use your workbooks, and plan the remaining year.",
  alternates: {
    canonical: "/switch-to-paper-based-homeschool"
  },
  openGraph: {
    title: "Switch Homeschool Programs Without Starting Over",
    description: "Keep your child’s progress and move the remaining school year to a calmer paper-first plan.",
    type: "website",
    url: "/switch-to-paper-based-homeschool",
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
    title: "Switch Homeschool Programs Without Starting Over",
    description: "Keep your child’s progress and move the remaining school year to a calmer paper-first plan.",
    images: ["https://www.treehomeschool.com/funnel-social-preview.png"]
  }
};

export default function SwitchToPaperBasedHomeschoolPage() {
  return <MarketingFunnelPage config={switchHomeschoolConfig} />;
}
