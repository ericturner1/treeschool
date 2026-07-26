import type { Metadata } from "next";
import { MarketingFunnelPage } from "../../components/marketing-funnel-page";
import { firstGradeHomeschoolConfig } from "../../lib/marketing/funnel-configs";

export const metadata: Metadata = {
  title: "Start First Grade Homeschooling With Confidence | Treeschool",
  description:
    "Start first grade homeschool with printable curriculum, weekly lesson plans, attendance, progress, and less screen time. Try Treeschool for $6.",
  alternates: {
    canonical: "/first-grade-homeschool"
  },
  openGraph: {
    title: "Start First Grade Homeschooling With Confidence",
    description: "A complete paper-first first-grade starting point for new homeschool parents.",
    type: "website",
    url: "/first-grade-homeschool",
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
    title: "Start First Grade Homeschooling With Confidence",
    description: "A complete paper-first first-grade starting point for new homeschool parents.",
    images: ["https://www.treehomeschool.com/funnel-social-preview.png"]
  }
};

export default function FirstGradeHomeschoolPage() {
  return <MarketingFunnelPage config={firstGradeHomeschoolConfig} />;
}
