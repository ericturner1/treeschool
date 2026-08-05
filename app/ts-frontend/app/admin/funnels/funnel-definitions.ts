export type FunnelStep = {
  name: string;
  description: string;
  href?: string;
  linkLabel?: string;
  kind?: "landing" | "order_form" | "offer" | "fulfillment";
};

export type Funnel = {
  id: string;
  name: string;
  status: string;
  audience: string;
  objective: string;
  landingHref: string;
  landingLabel: string;
  steps: FunnelStep[];
};

export const FUNNELS: Funnel[] = [
  {
    id: "first-grade-curriculum",
    name: "First-grade curriculum",
    status: "Primary launch funnel",
    audience: "Parents looking for a complete, printable first-grade curriculum.",
    objective: "Sell the core curriculum once or convert the parent to a Treeschool membership.",
    landingHref: "/first-grade-curriculum",
    landingLabel: "A/B-tested first-grade curriculum landing page",
    steps: [
      {
        name: "Sales Page A/B Test",
        description: "Assigns each new visitor persistently to one of two sales-page variants and carries that assignment through checkout.",
        href: "/first-grade-curriculum",
        linkLabel: "Open live experiment",
        kind: "landing"
      },
      {
        name: "Variant A · concise visual page",
        description: "The shorter, highly visual control page leads with the complete offer, actual workbooks, subject coverage, and fast answers.",
        href: "/first-grade-curriculum?preview_variant=a",
        linkLabel: "Preview Variant A",
        kind: "landing"
      },
      {
        name: "Variant B · direct-response page",
        description: "The longer challenger page develops the parent’s planning and screen-time problems before presenting the same curriculum and checkout.",
        href: "/first-grade-curriculum?preview_variant=b",
        linkLabel: "Preview Variant B",
        kind: "landing"
      },
      {
        name: "Detailed curriculum page",
        description: "Gives parents who want more detail the complete workbook list, curriculum coverage, and a fuller product comparison.",
        href: "/first-grade-homeschool-curriculum",
        linkLabel: "Open detailed page",
        kind: "landing"
      },
      {
        name: "Order form",
        description: "Confirms the curriculum and any optional bookstore additions before sending the parent to Stripe's secure hosted checkout.",
        href: "/first-grade-curriculum/choose?preview=1",
        linkLabel: "Open order form",
        kind: "order_form"
      },
      {
        name: "Beginner Japanese upsell",
        description: "Offers the complete Beginner Japanese PDF workbook bundle as a separate one-time addition.",
        href: "/admin/funnels/first-grade-curriculum/upsell",
        linkLabel: "Preview upsell",
        kind: "offer"
      },
      {
        name: "Japanese A downsell",
        description: "If the bundle is declined, offers the first Japanese workbook by itself at a lower entry price.",
        href: "/admin/funnels/first-grade-curriculum/downsell",
        linkLabel: "Preview downsell",
        kind: "offer"
      },
      {
        name: "Thank you and fulfillment",
        description: "Confirms the order, emails secure PDF download links, grants account access, and starts membership setup when applicable.",
        kind: "fulfillment"
      }
    ]
  },
  {
    id: "first-time-homeschooler",
    name: "First-time homeschooler",
    status: "Audience funnel",
    audience: "Parents preparing to homeschool a first grader for the first time.",
    objective: "Build confidence, explain the paper-based system, and lead the parent toward a Treeschool plan.",
    landingHref: "/first-grade-homeschool",
    landingLabel: "First-time homeschool landing page",
    steps: [
      {
        name: "Landing page",
        description: "Answers the beginner parent’s first questions and presents a clear way to begin first grade.",
        href: "/first-grade-homeschool",
        linkLabel: "Open landing page",
        kind: "landing"
      },
      {
        name: "Plans",
        description: "Compares Single and Standard membership options and explains the introductory first month.",
        href: "/pricing",
        linkLabel: "Open plans",
        kind: "order_form"
      },
      {
        name: "Account setup",
        description: "The parent signs in, adds a student, selects the curriculum, and begins building the school year.",
        kind: "fulfillment"
      }
    ]
  },
  {
    id: "switch-to-paper",
    name: "Switch to paper-based homeschool",
    status: "Audience funnel",
    audience: "Families already homeschooling who want less screen time, a calmer routine, or a lower-cost alternative.",
    objective: "Position Treeschool as the practical paper-based replacement for a screen-heavy homeschool platform.",
    landingHref: "/switch-to-paper-based-homeschool",
    landingLabel: "Switch-to-paper landing page",
    steps: [
      {
        name: "Landing page",
        description: "Names the screen-time problem and shows how printable workbooks and weekly plans change the daily experience.",
        href: "/switch-to-paper-based-homeschool",
        linkLabel: "Open landing page",
        kind: "landing"
      },
      {
        name: "Plans",
        description: "Lets the parent compare the student and teacher limits of the available memberships.",
        href: "/pricing",
        linkLabel: "Open plans",
        kind: "order_form"
      },
      {
        name: "Move the school year",
        description: "The parent adds Treeschool or existing PDF workbooks and creates a printable lesson plan without losing the paper-first routine.",
        kind: "fulfillment"
      }
    ]
  },
  {
    id: "no-subscription",
    name: "Homeschool without a subscription",
    status: "One-time purchase funnel",
    audience: "Parents who want printable curriculum but do not want another recurring subscription.",
    objective: "Sell standalone workbooks and bundles while introducing Treeschool’s broader paper-based approach.",
    landingHref: "/homeschool-without-a-subscription",
    landingLabel: "No-subscription landing page",
    steps: [
      {
        name: "Landing page",
        description: "Leads with ownership, printable PDFs, and the freedom to buy without beginning a membership.",
        href: "/homeschool-without-a-subscription",
        linkLabel: "Open landing page",
        kind: "landing"
      },
      {
        name: "Bookstore",
        description: "Lets the parent browse available grades, subjects, individual workbooks, and bundles.",
        href: "/bookstore",
        linkLabel: "Open bookstore",
        kind: "landing"
      },
      {
        name: "Product detail",
        description: "Explains the workbook or bundle, previews its pages, and collects the delivery email.",
        kind: "order_form"
      },
      {
        name: "Email delivery",
        description: "Emails secure PDF download links and keeps owned workbooks available in the parent’s account.",
        kind: "fulfillment"
      }
    ]
  }
];

export function getFunnel(id: string) {
  return FUNNELS.find((funnel) => funnel.id === id) ?? null;
}
