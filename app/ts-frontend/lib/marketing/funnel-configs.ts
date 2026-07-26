import type { MarketingFunnelConfig } from "../../components/marketing-funnel-page";

export const firstGradeHomeschoolConfig: MarketingFunnelConfig = {
  path: "/first-grade-homeschool",
  eyebrow: "For first-time homeschool parents",
  title: "Start first grade at home—with a complete plan from day one.",
  description:
    "Treeschool gives you a paper-first first-grade curriculum, printable weekly lesson plans, and one calm place to manage attendance, progress, and optional grades. You do not need to invent school at home from scratch.",
  caption: "Try Single for $6 for your first month. Then $14/month. Cancel anytime.",
  primaryCta: {
    kind: "subscription",
    label: "Start first grade for $6",
    planTier: "single"
  },
  secondaryCta: {
    kind: "link",
    label: "See how it works",
    href: "#how-it-works"
  },
  heroCard: {
    eyebrow: "Your first week",
    title: "A ready-made first-grade starting point",
    items: [
      "Core subjects organized into teachable days",
      "One printable PDF for the week—or separate daily files",
      "Attendance, progress, points, and optional grades ready to use"
    ],
    footer: "The parent plans online. The child learns primarily on paper."
  },
  quickFacts: [
    { value: "One click", label: "Add Treeschool’s recommended core curriculum" },
    { value: "Week by week", label: "Know exactly what to teach next" },
    { value: "Paper first", label: "Keep the child’s school day off the screen" }
  ],
  fit: {
    eyebrow: "A confident beginning",
    title: "Made for the parent asking, “Where do I even start?”",
    copy:
      "Beginning homeschool should feel deliberate—not like assembling dozens of disconnected resources and hoping nothing important was missed.",
    items: [
      {
        title: "You want a complete starting point",
        copy: "Begin with Treeschool’s recommended first-grade curriculum, then review and adjust it for your child."
      },
      {
        title: "You want a clear daily rhythm",
        copy: "Choose your teaching days and school-year dates. Treeschool turns the year into printable weekly and daily plans."
      },
      {
        title: "You want less screen time",
        copy: "Use the parent dashboard for organization while your child works from paper, books, projects, and real life."
      }
    ]
  },
  steps: {
    eyebrow: "A guided setup",
    title: "From a blank slate to Week 1.",
    copy: "Treeschool handles the organizational work while you remain in control of what your child learns.",
    items: [
      {
        title: "Tell us about your child",
        copy: "Set grade, school-year dates, teaching days, and a few helpful notes about strengths and needs."
      },
      {
        title: "Choose the curriculum",
        copy: "Add Treeschool’s recommended first-grade books in one click, use your own PDFs, or combine both."
      },
      {
        title: "Review the coverage",
        copy: "See whether the core academic areas are represented before approving the curriculum."
      },
      {
        title: "Print Week 1",
        copy: "Download the whole week or individual days and begin with a clear, manageable plan."
      }
    ]
  },
  benefits: {
    eyebrow: "Everything connected",
    title: "The practical tools a new homeschool parent needs.",
    items: [
      {
        title: "Printable core curriculum",
        copy: "Use included Treeschool workbooks for reading, language arts, mathematics, science, and social studies."
      },
      {
        title: "School-year pacing",
        copy: "See whether your child is ahead, on schedule, or behind based on your own calendar and planned days off."
      },
      {
        title: "Natural attendance records",
        copy: "Completed lessons build the attendance record, while field trips and other learning can be recorded separately."
      },
      {
        title: "Encouragement without more screens",
        copy: "Use learning streaks and customizable points to celebrate consistency without putting the child inside another app."
      }
    ]
  },
  offer: {
    eyebrow: "The easiest place to begin",
    title: "Start with Treeschool Single.",
    copy:
      "Single includes one student and the complete Treeschool K–4 platform. It is built for a parent starting with one first grader who wants the curriculum and the organization in one place.",
    points: [
      "One student profile and up to two Teacher users",
      "Treeschool core curriculum included",
      "Printable weekly and daily lesson plans",
      "Attendance, grades, progress, points, and streaks",
      "First month $6, then $14/month"
    ]
  },
  faqs: [
    {
      question: "Do I need teaching experience?",
      answer: "No. Treeschool organizes the curriculum and sequence so you can concentrate on teaching and supporting your child. You remain the parent and teacher."
    },
    {
      question: "Does Treeschool include first-grade curriculum?",
      answer: "Yes. Treeschool can provide a recommended first-grade core curriculum, and you can also add your own workbook PDFs."
    },
    {
      question: "Will my child need to learn on a computer?",
      answer: "No. Treeschool is designed so the parent uses the planning dashboard while the child learns mainly from printed pages, books, projects, and other offline activities."
    },
    {
      question: "Does this cover homeschool laws in my country or state?",
      answer: "No. Treeschool is an academic planning and recordkeeping tool, not legal advice, accreditation, or a country-specific compliance service. Parents remain responsible for local requirements."
    },
    {
      question: "Can I change the curriculum later?",
      answer: "Yes. You can update future materials and replan work ahead while preserving weeks that have already been started or completed."
    },
    {
      question: "Can another parent or tutor help?",
      answer: "Yes. Single includes up to two Teacher users who can help record attendance, grades, and completed work without receiving destructive account permissions."
    }
  ],
  finalCta: {
    eyebrow: "Your first homeschool year",
    title: "Begin with a plan you can actually follow.",
    copy: "Give your child a paper-first first-grade year and give yourself a clear next step every week."
  }
};

export const switchHomeschoolConfig: MarketingFunnelConfig = {
  path: "/switch-to-paper-based-homeschool",
  eyebrow: "For homeschool families ready to switch",
  title: "Switch homeschool programs—without making your child start over.",
  description:
    "Move away from a screen-heavy or expensive program while keeping the curriculum and progress that still work. Treeschool helps you begin from where your child is today and plan only what remains.",
  caption: "Bring your current workbook PDFs. Started and completed work stays respected.",
  primaryCta: {
    kind: "subscription",
    label: "Switch to Treeschool for $6",
    planTier: "single"
  },
  secondaryCta: {
    kind: "link",
    label: "See the switching process",
    href: "#how-it-works"
  },
  heroCard: {
    eyebrow: "A calmer transition",
    title: "Keep what worked. Leave what did not.",
    items: [
      "Use the workbooks and lessons you already own",
      "Mark completed or mastered material so it is not repeated",
      "Build the remaining school year around your real calendar"
    ],
    footer: "No artificial restart. No need to throw away your child’s progress."
  },
  quickFacts: [
    { value: "Keep progress", label: "Completed work remains completed" },
    { value: "Use your PDFs", label: "Bring curriculum you already purchased" },
    { value: "From $14/mo", label: "A lower-cost paper-first platform" }
  ],
  fit: {
    eyebrow: "A better second chapter",
    title: "For families who know what they want to leave behind.",
    copy:
      "You have already learned something valuable from homeschooling: what does and does not fit your child. Treeschool helps you act on that knowledge.",
    items: [
      {
        title: "The screens are taking over",
        copy: "Shift the child’s school day back to printed lessons, physical books, conversation, projects, and hands-on work."
      },
      {
        title: "The monthly price feels too high",
        copy: "Treeschool starts at $14/month for one student while still including planning, curriculum, attendance, and progress tools."
      },
      {
        title: "The current sequence is not working",
        copy: "Bring your present materials, tell Treeschool what has been mastered or delayed, and organize the remaining work differently."
      }
    ]
  },
  steps: {
    eyebrow: "Switch without disruption",
    title: "Continue the year instead of restarting it.",
    copy: "Treeschool treats past progress as part of the planning context, not as something to erase.",
    items: [
      {
        title: "Set the current position",
        copy: "Add your child, school-year dates, teaching schedule, and notes about what is ahead or behind."
      },
      {
        title: "Bring current materials",
        copy: "Upload the workbook PDFs you still want or replace gaps with Treeschool’s indexed books."
      },
      {
        title: "Preserve prior progress",
        copy: "Mark lessons completed, mastered, delayed, or removed so future planning reflects what really happened."
      },
      {
        title: "Build the remaining weeks",
        copy: "Generate a balanced plan for the work ahead and print the next useful week."
      }
    ]
  },
  benefits: {
    eyebrow: "Built for continuity",
    title: "Change platforms without losing the school year.",
    items: [
      {
        title: "Progress-aware planning",
        copy: "Previously completed and mastered lessons can remain out of future plans while delayed work can return later."
      },
      {
        title: "Your curriculum remains yours",
        copy: "Treeschool can organize curriculum you already chose instead of forcing every family into one proprietary sequence."
      },
      {
        title: "A paper-first daily experience",
        copy: "The parent manages the plan online; the child can complete schoolwork without living inside a browser."
      },
      {
        title: "Records continue in one place",
        copy: "Track attendance, progress, optional grades, teacher activity, points, and streaks after the move."
      }
    ]
  },
  offer: {
    eyebrow: "A lower-friction switch",
    title: "Start with the student you are moving first.",
    copy:
      "Treeschool Single gives one child the complete platform for $14/month after the introductory month. Standard supports up to three students when the whole family is ready.",
    points: [
      "Use your current curriculum PDFs",
      "Add Treeschool core workbooks when needed",
      "Preserve completed and started progress",
      "Print weekly or individual-day lesson files",
      "First month $6 and cancel anytime"
    ]
  },
  faqs: [
    {
      question: "Do we have to begin at Week 1?",
      answer: "No. Set your current school-year dates and identify completed or mastered work so Treeschool can focus planning on what remains."
    },
    {
      question: "Can I use curriculum bought from another company?",
      answer: "Yes, provided you have lawful access to the workbook PDFs. Treeschool is designed to organize curriculum your family already selected."
    },
    {
      question: "Will switching erase attendance or grades?",
      answer: "No. New Treeschool records begin in your account, and prior information can be reflected through completed lessons, grades, attendance entries, and other learning records."
    },
    {
      question: "Can we switch only one child?",
      answer: "Yes. Single supports one student. Standard supports up to three when you are ready to move more of the family."
    },
    {
      question: "Can we reduce repetitive workbook pages?",
      answer: "Treeschool’s planning metadata can identify lesson units and help you omit mastered or unnecessary material before future PDFs are generated."
    },
    {
      question: "Is Treeschool an accredited school?",
      answer: "No. Treeschool supports parent-directed homeschooling with planning, printable materials, and records. It does not provide accreditation or replace local legal requirements."
    }
  ],
  finalCta: {
    eyebrow: "Keep moving forward",
    title: "Your child’s progress should survive the switch.",
    copy: "Bring the useful parts of your current homeschool into a calmer, paper-first plan for the rest of the year."
  }
};

export const noSubscriptionHomeschoolConfig: MarketingFunnelConfig = {
  path: "/homeschool-without-a-subscription",
  eyebrow: "For parents who prefer to buy once",
  title: "Buy printable homeschool workbooks without a subscription.",
  description:
    "Choose individual Treeschool workbooks or curriculum bundles, download the PDFs, and print what your child needs. You keep the materials you purchase, with no recurring membership required.",
  caption: "Pay once per workbook or bundle. No automatic renewal.",
  primaryCta: {
    kind: "link",
    label: "Browse one-time workbooks",
    href: "/bookstore"
  },
  secondaryCta: {
    kind: "link",
    label: "Compare memberships",
    href: "/pricing"
  },
  heroCard: {
    eyebrow: "Available now",
    title: "Buy what you need. Keep what you buy.",
    items: [
      "Shop printable workbooks by grade and subject",
      "Choose individual titles or money-saving bundles",
      "Download purchased PDFs and teach on your schedule"
    ],
    footer: "A straightforward purchase—not an ongoing subscription."
  },
  quickFacts: [
    { value: "Pay once", label: "One clear price per workbook or bundle" },
    { value: "No renewal", label: "Workbook purchases never rebill" },
    { value: "Printable PDFs", label: "Download materials made for paper-first learning" }
  ],
  fit: {
    eyebrow: "Curriculum without recurring access",
    title: "For parents who want useful materials without another monthly bill.",
    copy:
      "Build the collection your family needs, one subject or bundle at a time, and keep the printable materials you purchase.",
    items: [
      {
        title: "You prefer to buy curriculum outright",
        copy: "Purchase Treeschool workbooks as printable PDFs without taking on a recurring platform payment."
      },
      {
        title: "You need only a few subjects",
        copy: "Fill a specific curriculum gap without paying for materials your child does not need."
      },
      {
        title: "You want a paper-first resource",
        copy: "Print lessons for your child instead of placing another screen at the center of the school day."
      }
    ]
  },
  steps: {
    eyebrow: "Simple from start to finish",
    title: "Choose, purchase, download, and print.",
    copy: "Every step is built around a product you can purchase today.",
    items: [
      {
        title: "Browse the bookstore",
        copy: "Filter available workbooks by grade and explore the subjects that fit your child."
      },
      {
        title: "Review the details",
        copy: "See the workbook description, grade range, page count, cover, and price before buying."
      },
      {
        title: "Check out securely",
        copy: "Purchase one title or several together through Treeschool’s secure checkout."
      },
      {
        title: "Download and print",
        copy: "Receive access to the purchased PDF files and begin using them at home."
      }
    ]
  },
  benefits: {
    eyebrow: "Made for paper-first families",
    title: "Practical homeschool materials with straightforward prices.",
    items: [
      {
        title: "Grade-level workbooks",
        copy: "Choose materials built for the grade and subject your child is currently studying."
      },
      {
        title: "Core subjects and electives",
        copy: "Shop foundational academic material or add focused subjects that reflect your family’s priorities."
      },
      {
        title: "Curriculum bundles",
        copy: "Purchase related workbooks together when you want a broader, coordinated starting point."
      },
      {
        title: "Screen-light learning",
        copy: "Use digital delivery for the parent while keeping the child’s lesson work rooted in printed pages."
      }
    ]
  },
  offer: {
    eyebrow: "Available in the Treeschool bookstore",
    title: "Buy printable materials without joining a plan.",
    copy:
      "Treeschool’s bookstore offers individual workbooks and bundles as one-time purchases. Choose the materials that suit your child and pay only for those products.",
    points: [
      "Individual printable workbooks",
      "Multi-workbook curriculum bundles",
      "Grade and subject information before checkout",
      "Secure online purchase and PDF delivery",
      "No automatic renewal"
    ]
  },
  faqs: [
    {
      question: "Are these workbooks available to purchase now?",
      answer: "Yes. Every published product shown in the Treeschool bookstore is available for purchase."
    },
    {
      question: "Do I need a Treeschool membership?",
      answer: "No. You can purchase printable workbooks and bundles from the bookstore without beginning a recurring membership."
    },
    {
      question: "Will a workbook purchase automatically renew?",
      answer: "No. A bookstore purchase is a one-time transaction and does not start recurring billing."
    },
    {
      question: "Can I buy more than one workbook at a time?",
      answer: "Yes. Add multiple individual titles or available bundles to your cart and complete them in one checkout."
    },
    {
      question: "Are the workbooks intended to be printed?",
      answer: "Yes. Treeschool workbooks are downloadable PDFs designed for paper-first homeschooling."
    },
    {
      question: "What if I want lesson planning and recordkeeping too?",
      answer: "Treeschool memberships add the full planning and family-management platform. You can compare the available plans on the pricing page."
    }
  ],
  finalCta: {
    eyebrow: "Choose only what your family needs",
    title: "Buy the workbook. Download the PDF. Start teaching.",
    copy: "Browse Treeschool’s currently available one-time workbooks and curriculum bundles."
  }
};
