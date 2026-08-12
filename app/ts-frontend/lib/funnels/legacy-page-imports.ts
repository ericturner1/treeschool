import type { MarketingFunnelConfig } from "../../components/marketing-funnel-page";
import {
  firstGradeHomeschoolConfig,
  noSubscriptionHomeschoolConfig,
  switchHomeschoolConfig
} from "../marketing/funnel-configs";
import type { AdminFunnelStep } from "./server";
import type {
  FunnelAction,
  FunnelMediaSnapshot,
  FunnelPageColumn,
  FunnelPageDocument,
  FunnelPageElement,
  FunnelPageRow,
  FunnelPageSection,
  FunnelPageTone,
  FunnelPageWidth,
  FunnelTextAlign
} from "./page-document";

export type LegacyFunnelPageImport = {
  content: FunnelPageDocument;
  seo: { title: string; description: string; noIndex: boolean };
};

let sequence = 0;
function id(prefix: string) {
  sequence += 1;
  return `imported_${prefix}_${sequence}`;
}

function eyebrow(text: string, align: FunnelTextAlign = "left"): FunnelPageElement {
  return { id: id("eyebrow"), type: "eyebrow", props: { text, align } };
}

function heading(
  text: string,
  level: "h1" | "h2" | "h3" = "h2",
  align: FunnelTextAlign = "left"
): FunnelPageElement {
  return { id: id("heading"), type: "heading", props: { text, level, align } };
}

function text(
  value: string,
  style: "lead" | "body" | "small" = "body",
  align: FunnelTextAlign = "left"
): FunnelPageElement {
  return { id: id("text"), type: "text", props: { text: value, style, align } };
}

function list(items: string[], style: "checks" | "bullets" = "checks"): FunnelPageElement {
  return { id: id("list"), type: "list", props: { items, style, align: "left" } };
}

function button(
  label: string,
  action: FunnelAction,
  variant: "primary" | "secondary" | "text" = "primary",
  align: FunnelTextAlign = "left"
): FunnelPageElement {
  return { id: id("button"), type: "button", props: { label, action, variant, align } };
}

function media(publicUrl: string, alt: string): FunnelMediaSnapshot {
  return {
    assetId: null,
    storagePath: null,
    publicUrl,
    alt,
    width: null,
    height: null
  };
}

function image(publicUrl: string, alt: string, caption = ""): FunnelPageElement {
  return {
    id: id("image"),
    type: "image",
    props: { media: media(publicUrl, alt), fit: "contain", caption }
  };
}

function column(elements: FunnelPageElement[], span = 12): FunnelPageColumn {
  return { id: id("column"), span, elements };
}

function row(columns: FunnelPageColumn[]): FunnelPageRow {
  return { id: id("row"), columns };
}

function section(
  rows: FunnelPageRow[],
  tone: FunnelPageTone = "default",
  width: FunnelPageWidth = "standard"
): FunnelPageSection {
  return {
    id: id("section"),
    props: { tone, width, background: null },
    rows
  };
}

function document(sections: FunnelPageSection[], theme: FunnelPageDocument["theme"] = "sage"):
  FunnelPageDocument {
  return {
    schemaVersion: 2,
    kind: "funnel_page",
    theme,
    styles: {
      layout: { contentWidth: 1120, sectionGap: 0, sectionPaddingY: 64, columnGap: 32 },
      buttons: { borderRadius: 18 }
    },
    assets: [],
    sections
  };
}

function ctaAction(config: MarketingFunnelConfig, primary: boolean): FunnelAction {
  const cta = primary ? config.primaryCta : config.secondaryCta;
  if (cta.kind === "link") {
    return {
      type: "url",
      target: cta.href.startsWith("#") ? `${config.path}${cta.href}` : cta.href
    };
  }
  if (cta.kind === "email") {
    return { type: "url", target: `mailto:support@treehomeschool.com?subject=${encodeURIComponent(cta.subject)}` };
  }
  // Subscription checkout is an application-owned action. Keep the imported
  // copy editable while routing safely through the current plans screen.
  return { type: "url", target: "/pricing" };
}

function marketingConfigImport(config: MarketingFunnelConfig): LegacyFunnelPageImport {
  const fitItems = config.fit.items.flatMap((item) => [item.title, item.copy]);
  const stepItems = config.steps.items.flatMap((item, index) => [
    `${index + 1}. ${item.title}`,
    item.copy
  ]);
  const benefitItems = config.benefits.items.flatMap((item) => [item.title, item.copy]);
  return {
    content: document([
      section([
        row([
          column([
            eyebrow(config.eyebrow),
            heading(config.title, "h1"),
            text(config.description, "lead"),
            button(config.primaryCta.label, ctaAction(config, true)),
            button(config.secondaryCta.label, ctaAction(config, false), "secondary"),
            text(config.caption, "small")
          ], 7),
          column([
            image(
              "/hero-paper-learning-crop.jpg",
              "Children completing paper-based homeschool lessons at a table"
            ),
            eyebrow(config.heroCard.eyebrow),
            heading(config.heroCard.title, "h2"),
            list(config.heroCard.items),
            text(config.heroCard.footer, "small")
          ], 5)
        ])
      ], "accent", "wide"),
      section([
        row([column([
          eyebrow(config.fit.eyebrow, "center"),
          heading(config.fit.title, "h2", "center"),
          text(config.fit.copy, "lead", "center"),
          list(fitItems, "bullets")
        ])])
      ]),
      section([
        row([column([
          eyebrow(config.steps.eyebrow, "center"),
          heading(config.steps.title, "h2", "center"),
          text(config.steps.copy, "body", "center"),
          list(stepItems, "bullets")
        ])])
      ], "muted"),
      section([
        row([column([
          eyebrow(config.benefits.eyebrow),
          heading(config.benefits.title),
          list(benefitItems)
        ], 7), column([
          eyebrow(config.offer.eyebrow),
          heading(config.offer.title),
          text(config.offer.copy),
          list(config.offer.points),
          ...(config.offer.note ? [text(config.offer.note, "small")] : [])
        ], 5)])
      ]),
      section([
        row([column([
          heading("Questions parents ask before beginning", "h2", "center"),
          ...config.faqs.flatMap((faq) => [
            heading(faq.question, "h3"),
            text(faq.answer)
          ])
        ])])
      ], "muted", "narrow"),
      section([
        row([column([
          eyebrow(config.finalCta.eyebrow, "center"),
          heading(config.finalCta.title, "h2", "center"),
          text(config.finalCta.copy, "lead", "center"),
          button(config.primaryCta.label, ctaAction(config, true), "primary", "center")
        ])])
      ], "dark", "narrow")
    ]),
    seo: {
      title: config.title,
      description: config.description,
      noIndex: false
    }
  };
}

const workbookCovers = [
  ["Phonics B", "/first-grade-curriculum/phonics-b.png"],
  ["Reading (Level D)", "/first-grade-curriculum/reading-level-d.png"],
  ["Reading (Level E)", "/first-grade-curriculum/reading-level-e.png"],
  ["Reading (Level F)", "/first-grade-curriculum/reading-level-f.png"],
  ["Reading (Level G)", "/first-grade-curriculum/reading-level-g.png"],
  ["Reading (Level H)", "/first-grade-curriculum/reading-level-h.png"],
  ["Reading (Level I)", "/first-grade-curriculum/reading-level-i.png"],
  ["Writing & Grammar 1", "/first-grade-curriculum/writing-and-grammar-1.png"],
  ["Spelling 1", "/first-grade-curriculum/spelling-1.png"],
  ["Math 1", "/first-grade-curriculum/math-1.png"],
  ["Science 1", "/first-grade-curriculum/science-1.png"],
  ["Social Studies 1", "/first-grade-curriculum/social-studies-1.png"]
] as const;

function workbookGallerySections() {
  const groups: FunnelPageSection[] = [];
  for (let index = 0; index < workbookCovers.length; index += 4) {
    groups.push(section([
      row(workbookCovers.slice(index, index + 4).map(([title, url]) =>
        column([image(url, `${title} workbook cover`), heading(title, "h3", "center")], 3)
      ))
    ], "default", "wide"));
  }
  return groups;
}

function conciseCurriculumImport(): LegacyFunnelPageImport {
  const description = "A complete paper-first core curriculum for reading, language arts, mathematics, science, and social studies—delivered as printable PDF workbooks.";
  return {
    content: document([
      section([
        row([
          column([
            eyebrow("A complete, printable first-grade homeschool curriculum"),
            heading("Your first-grade homeschool year, ready to print.", "h1"),
            text(description, "lead"),
            list([
              "A coordinated collection of printable PDF workbooks",
              "Core instruction across the principal first-grade subjects",
              "Immediate digital delivery after checkout",
              "No subscription required"
            ]),
            button("Choose the complete curriculum", { type: "next_step" }),
            button("See every workbook", { type: "url", target: "/first-grade-homeschool-curriculum" }, "secondary")
          ], 7),
          column([
            image("/funnel-social-preview.png", "Treeschool printable first-grade curriculum")
          ], 5)
        ])
      ], "accent", "wide"),
      section([
        row([column([
          eyebrow("What your child will study", "center"),
          heading("The core first-grade subjects, gathered in one place.", "h2", "center"),
          list([
            "Reading and phonics that build confidence progressively",
            "Writing, grammar, and spelling practice",
            "Mathematics from number sense through first-grade operations",
            "Science grounded in observation and the natural world",
            "Social studies covering family, community, geography, and citizenship"
          ])
        ])])
      ]),
      ...workbookGallerySections(),
      section([
        row([column([
          eyebrow("Paper-first learning", "center"),
          heading("Keep childhood rooted in books, paper, conversation, and real life.", "h2", "center"),
          text("The parent can use Treeschool for organization while the child learns primarily from printed lessons—without spending the school day inside another app.", "lead", "center"),
          button("Choose the complete curriculum", { type: "next_step" }, "primary", "center")
        ])])
      ], "dark", "narrow")
    ]),
    seo: {
      title: "Complete First Grade Homeschool Curriculum | Treeschool",
      description,
      noIndex: false
    }
  };
}

function directResponseCurriculumImport(): LegacyFunnelPageImport {
  const description = "A coordinated year of printable first-grade reading, language arts, math, science, and social studies—without handing childhood over to another screen.";
  return {
    content: document([
      section([
        row([column([
          eyebrow("A complete, printable first-grade homeschool curriculum", "center"),
          heading("Stop piecing first grade together one worksheet at a time.", "h1", "center"),
          text(description, "lead", "center"),
          image("/funnel-social-preview.png", "Treeschool printable first-grade curriculum"),
          button("Get the complete curriculum", { type: "next_step" }, "primary", "center"),
          text("Secure checkout · Printable PDFs · Files are yours to keep", "small", "center")
        ])])
      ], "accent", "narrow"),
      section([
        row([column([
          eyebrow("Dear homeschool parent,"),
          heading("You did not choose homeschooling to become a curriculum department.", "h2"),
          text("Yet many first-grade parents spend every Sunday night searching for Monday's lesson: phonics from one website, math from another, and a nagging question about what may have been missed.", "lead"),
          text("The problem is not a lack of effort. An endless pile of disconnected resources asks you to invent a school year before you can simply teach your child."),
          text("And when the easiest alternative is another all-day online program, the planning burden is merely exchanged for more screen time and more digital distraction.")
        ])])
      ], "default", "narrow"),
      section([
        row([column([
          heading("First grade can be simpler than that.", "h2", "center"),
          text("Begin with the core subjects gathered in one place. Print what you need, sit beside your child, and teach from paper.", "lead", "center")
        ])])
      ], "accent", "narrow"),
      section([
        row([column([
          eyebrow("The hidden cost of free"),
          heading("A worksheet is only free until you have to build a year around it."),
          text("Every isolated download creates another decision: Is this at the right level? What comes before it? What follows it? Does it leave a gap? The real price is paid in evenings, attention, and confidence."),
          list([
            "Less searching—open the collection instead of beginning every lesson with a browser",
            "Fewer gaps—bring the principal first-grade subjects together",
            "More authority—adapt a visible curriculum to your child instead of obeying an app's pace"
          ])
        ])])
      ], "muted"),
      ...workbookGallerySections(),
      section([
        row([column([
          heading("Your first-grade core year, ready to print.", "h2", "center"),
          list([
            "Coordinated PDF workbooks",
            "Reading, language arts, math, science, and social studies",
            "Immediate digital delivery",
            "No subscription required"
          ]),
          button("Get the complete curriculum", { type: "next_step" }, "primary", "center")
        ])])
      ], "dark", "narrow")
    ]),
    seo: {
      title: "A Complete Printable First-Grade Homeschool Curriculum",
      description,
      noIndex: false
    }
  };
}

function detailedCurriculumImport(): LegacyFunnelPageImport {
  const description = "Explore every printable workbook in Treeschool's complete paper-first first-grade curriculum, with coverage across reading, language arts, mathematics, science, and social studies.";
  return {
    content: document([
      section([
        row([
          column([
            eyebrow("Complete first-grade core curriculum"),
            heading("A paper-first first-grade year you can see, print, and teach.", "h1"),
            text(description, "lead"),
            list([
              "Printable PDF workbooks delivered digitally",
              "Teach at the pace that fits your child",
              "Buy the collection once or use it inside Treeschool",
              "Keep the child's school day away from another screen"
            ]),
            button("Choose how to begin", { type: "next_step" })
          ], 7),
          column([image("/funnel-social-preview.png", "Treeschool first-grade curriculum collection")], 5)
        ])
      ], "accent", "wide"),
      section([
        row([column([
          eyebrow("First-grade coverage", "center"),
          heading("The essentials, gathered into one coordinated collection.", "h2", "center"),
          list([
            "Mathematics: number sense, operations, measurement, data, and early geometry",
            "Language arts: phonics, progressive reading, spelling, writing, grammar, and conventions",
            "Science: life, physical, earth, and space science for young learners",
            "Social studies: civics, history, geography, community, and basic economics"
          ])
        ])])
      ]),
      ...workbookGallerySections(),
      section([
        row([column([
          heading("Buy once, or add planning and records.", "h2"),
          text("The curriculum can stand alone as downloadable PDFs. A Treeschool membership adds automatic weekly planning, attendance, optional grades, progress, points, streaks, and school-year pacing."),
          button("Choose how to begin", { type: "next_step" })
        ])])
      ], "muted", "narrow")
    ]),
    seo: {
      title: "First Grade Homeschool Curriculum | Printable Complete Program",
      description,
      noIndex: false
    }
  };
}

function japaneseOfferImport(mode: "full" | "starter"): LegacyFunnelPageImport {
  const full = mode === "full";
  const title = full
    ? "Add “Beginner Japanese” to your order?"
    : "Start with just “Japanese A”?";
  const description = full
    ? "A bundle of four printable PDF workbooks that guides a child through a beginner Japanese sequence."
    : "A printable PDF workbook that introduces a child to beginner Japanese.";
  const offerKey = full ? "first-grade-japanese-full" : "first-grade-japanese-starter";
  return {
    content: document([
      section([
        row([
          column([
            image("/funnel-social-preview.png", full ? "Beginner Japanese workbook bundle" : "Japanese A workbook")
          ], 5),
          column([
            eyebrow(full ? "A one-time addition" : "A smaller way to begin"),
            heading(title, "h1"),
            text(description, "lead"),
            text("This is a separate one-time purchase with no subscription or recurring charge. Secure PDF download links are emailed after purchase, and the files remain available in Purchased Workbooks."),
            button(
              full ? "Yes—add the Japanese bundle" : "Yes—add Japanese A",
              { type: "accept_offer", offerKey },
              "primary"
            ),
            button(
              "No thanks—continue",
              { type: "decline_offer", offerKey },
              "secondary"
            )
          ], 7)
        ])
      ], "accent", "wide")
    ]),
    seo: { title, description, noIndex: true }
  };
}

function purchaseFulfillmentImport(): LegacyFunnelPageImport {
  return {
    content: document([
      section([
        row([column([
          eyebrow("Purchase complete", "center"),
          heading("Thank you! You're done with your purchase journey.", "h1", "center"),
          text(
            "Your order is complete. There is nothing else you need to buy or approve before continuing to your Treeschool account.",
            "lead",
            "center"
          ),
          list([
            "Your purchase is safely attached to your account",
            "PDF purchases receive secure delivery links by email",
            "You can return to your account whenever you need your materials"
          ]),
          button("Go to your account", { type: "url", target: "/p/dashboard" }, "primary", "center")
        ])])
      ], "accent", "narrow"),
      section([
        row([column([
          eyebrow("Completely optional", "center"),
          heading("Want planning and recordkeeping tools too?", "h2", "center"),
          text(
            "Your purchase is already finished. If you would also like weekly planning, grades, attendance, and progress tracking, you can review Treeschool membership separately.",
            "body",
            "center"
          ),
          button("See optional membership plans", { type: "url", target: "/pricing" }, "secondary", "center"),
          text("No action is required. You can simply continue to your account.", "small", "center")
        ])])
      ], "muted", "narrow")
    ]),
    seo: {
      title: "Purchase complete · Treeschool",
      description: "Your Treeschool purchase is complete and ready in your account.",
      noIndex: true
    }
  };
}

export function getLegacyFunnelPageImport(step: AdminFunnelStep): LegacyFunnelPageImport | null {
  sequence = 0;
  switch (step.sourceRef) {
    case "first_grade_curriculum_variant_a":
      return conciseCurriculumImport();
    case "first_grade_curriculum_variant_b":
      return directResponseCurriculumImport();
    case "first_grade_homeschool_curriculum_detail":
      return detailedCurriculumImport();
    case "first_grade_japanese_upsell":
      return japaneseOfferImport("full");
    case "first_grade_japanese_downsell":
      return japaneseOfferImport("starter");
    case "purchase_fulfillment":
      return purchaseFulfillmentImport();
    case "first_grade_homeschool_landing":
      return marketingConfigImport(firstGradeHomeschoolConfig);
    case "switch_to_paper_landing":
      return marketingConfigImport(switchHomeschoolConfig);
    case "no_subscription_landing":
      return marketingConfigImport(noSubscriptionHomeschoolConfig);
    default:
      return null;
  }
}

export function canImportLegacyFunnelPage(step: AdminFunnelStep) {
  return Boolean(step.sourceRef && getLegacyFunnelPageImport(step));
}
