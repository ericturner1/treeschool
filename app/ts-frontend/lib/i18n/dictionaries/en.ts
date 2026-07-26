const en = {
  metadata: {
    title: "Treeschool | Elementary Homeschool Program for Grades K–4",
    description: "Treeschool is a paper-first elementary homeschooling program for grades K–4. Create printable weekly lesson plans, reduce screen time, and track progress, attendance, and optional grades."
  },
  home: {
    brand: {
      name: "Treeschool",
      tagline: "Paper-Based Homeschool Program"
    },
    nav: {
      howItWorks: "How it works",
      pricing: "Pricing",
      buyNow: "View plans",
      signIn: "Parent sign in",
      languageLabel: "Language"
    },
    hero: {
      kicker: "Elementary homeschool program · Grades K–4",
      title: "Homeschooling, without the screens.",
      description:
        "Bring your own curriculum, or use our K–4 elementary curriculum to fill in the gaps. Treeschool turns it all into printable weekly lesson plans for the entire year, so your children learn without being glued to another screen.",
      audienceLabel: "For parents & guardians:",
      primaryCta: "Try Treeschool for $6",
      secondaryCta: "View plans",
      offerCaption: "First month $6, then plans from $14/month",
      guaranteeCaption: "Cancel anytime. Includes one initial lesson plan per child during the first month.",
      imageAlt: "Children writing in paper workbooks at a homeschool table"
    },
    paths: {
      items: [
        {
          eyebrow: "New to homeschooling?",
          title: "Begin first grade with confidence",
          copy: "Begin with a complete first-grade curriculum, printable weekly plans, and a clear first step.",
          href: "/first-grade-homeschool",
          linkLabel: "First-grade starting guide"
        },
        {
          eyebrow: "Already homeschooling?",
          title: "Switch without starting over",
          copy: "Keep the work and progress that still serve your child while moving to a calmer paper-first program.",
          href: "/switch-to-paper-based-homeschool",
          linkLabel: "See how switching works"
        },
        {
          eyebrow: "Avoiding another subscription?",
          title: "Choose printable workbooks you can keep",
          copy: "Buy individual Treeschool workbooks and bundles as downloadable PDFs—without a recurring membership.",
          href: "/homeschool-without-a-subscription",
          linkLabel: "Browse pay-once options"
        }
      ]
    },
    proof: {
      eyebrow: "From curriculum to school week",
      title: "Your curriculum in. A ready-to-teach year out.",
      copy:
        "Add the curriculum you have already chosen. Treeschool reads its sequence, organizes lessons into teachable days, and gives you back one ready-to-print plan for each week.",
      inputsTitle: "Your curriculum PDFs",
      inputs: [
        "Math workbook.pdf",
        "Language arts workbook.pdf",
        "Science workbook.pdf",
        "History workbook.pdf"
      ],
      outputsTitle: "Your printable weekly lesson plans",
      outputPrefix: "Week",
      outputCount: 36,
      outputCaption: "Each weekly PDF contains every subject scheduled for that week, organized into clear day-by-day sections.",
      note: "This example uses 36 teaching weeks. You choose the number of weeks that fits your family."
    },
    benefits: {
      eyebrow: "More than a lesson plan generator",
      title: "One paper-first home for planning, teaching, and keeping records.",
      cards: [
        {
          title: "Escape the influence of the screen",
          copy:
            "Give your children a clear plan on paper instead of letting the school day become more hours glued to another screen."
        },
        {
          title: "Print the week—or the day",
          copy:
            "Download one complete weekly plan or individual school-day files, with every scheduled subject kept together."
        },
        {
          title: "Know exactly what comes next",
          copy:
            "Mark lessons and days done, see year progress at a glance, and return to the next useful action."
        },
        {
          title: "Keep attendance naturally",
          copy:
            "Build attendance from completed school days and add field trips, co-ops, projects, and other real learning."
        },
        {
          title: "Grade only when it helps",
          copy:
            "Add optional subject grades, see automatic letter grades, and review results across current and past years."
        },
        {
          title: "Adapt without losing progress",
          copy:
            "Change future materials and replan the work ahead while keeping started and completed weeks intact."
        }
      ]
    },
    cta: {
      eyebrow: "A calmer homeschool command center",
      title: "Keep the curriculum you love. Lose the weekly scramble.",
      description:
        "Treeschool keeps printable lessons and homeschool records together for parents—without turning the child’s school day into more screen time.",
      primary: "View plans",
      secondary: "Start building a lesson plan"
    },
    footer: {
      description:
        "You chose homeschooling because you want to shape your child’s education—not hand their attention to another screen. Treeschool helps you teach grades K–4 with curriculum you trust, printable weekly lessons, real books, hands-on work, and the time-tested simplicity of pencil and paper.",
      columns: [
        {
          title: "Explore",
          links: ["Pricing", "Bookstore", "Blog"]
        },
        {
          title: "Get started",
          links: ["View plans", "Parent sign in"]
        },
        {
          title: "Find your path",
          links: ["Starting first grade", "Switching homeschool programs", "No-subscription homeschooling"]
        }
      ],
      copyright: "Copyright © 2026 Treeschool. All rights reserved.",
      privacy: "Privacy",
      terms: "Terms"
    }
  },
  auth: {
    signup: {
      title: "Create your Treeschool account",
      subtitle: "Start with a free account and begin exploring the platform.",
      submit: "Create account",
      switchPrompt: "Already have an account?",
      switchLink: "Sign in"
    },
    signin: {
      title: "Welcome Back!",
      subtitle: "This is where parents sign in!",
      submit: "Sign in",
      switchPrompt: "Need an account?",
      switchLink: "Create one"
    },
    fields: {
      email: "Email",
      password: "Password"
    },
    helper: "Treeschool uses Supabase Auth. Add your public Supabase project values in the frontend environment before testing real sign-ins.",
    messages: {
      missingEnv: "Missing Supabase environment variables.",
      invalidCredentials: "Invalid email or password.",
      genericError: "Something went wrong. Please try again.",
      checkEmail: "Check your email to confirm your account before signing in.",
      signedOut: "You have been signed out."
    }
  },
  dashboard: {
    title: "Parent Dashboard",
    subtitle: "",
    welcome: "Welcome back",
    parentRole: "PARENT",
    studentRole: "STUDENT",
    profileSwitcher: {
      label: "Switch profile",
      current: "Current profile",
      parentSection: "Parent view",
      studentSection: "Child records",
      switchTo: "Switch to",
      currentBadge: "Current",
      parentPasswordLabel: "Parent password",
      parentPasswordPlaceholder: "Enter password",
      returnToParent: "Return to parent",
      studentLocked: "Parent access required to leave child view.",
      overlayTitle: "Parent access required",
      overlayCopy: "Enter the parent password to switch back into the parent account and continue here."
    },
    sections: [
      {
        title: "Curriculum",
        copy: "Start with grade-level paths, upcoming lessons, and practical projects."
      },
      {
        title: "Progress",
        copy: "Track student momentum, attendance, and subject coverage over time."
      },
      {
        title: "Family planning",
        copy: "Organize weekly rhythm, goals, and homestead-based learning blocks."
      }
    ],
    actions: {
      dashboard: "Dashboard",
      browse: "Browse curriculum",
      electives: "Electives",
      settings: "Settings",
      teachers: "Teachers",
      account: "Account",
      home: "Back to home",
      logout: "Log out"
    },
    unauthenticated: "Please sign in to view the dashboard.",
    profileManagement: {
      title: "My Students",
      subtitle: "",
      empty: "No children added yet.",
      columns: {
        name: "Name",
        age: "Age",
        grade: "Grade",
        actions: "Actions"
      },
      noGrade: "—",
      manageLabel: "Manage",
      addTitle: "Add a child",
      addButton: "Add student",
      cancel: "Cancel",
      fields: {
        firstName: "First name",
        birthDate: "Birth date",
        gradeLevel: "Grade level"
      },
      submit: "Create student profile"
    },
    studentManagement: {
      back: "Back to dashboard",
      title: "Student management",
      subtitle: "Review enrollment and manage curriculum for this student.",
      overviewTitle: "Overview",
      enrolledTitle: "Enrolled curriculum",
      availableTitle: "Available curriculum",
      emptyEnrolled: "This student is not enrolled in any curriculum yet.",
      emptyAvailable: "No curriculum is currently available for this student's grade.",
      add: "Add curriculum",
      remove: "Remove",
      manage: "Manage student",
      gradeUnknown: "No grade set",
      bornLabel: "Born",
      sectionSummaryTitle: "Student summary",
      nav: {
        overview: "Overview",
        curriculum: "Lesson Plan",
        attendance: "Attendance",
        reports: "Reports",
        grades: "Grades",
        points: "Points",
        settings: "Settings"
      },
      cards: {
        curriculumTitle: "Lesson Plan",
        curriculumCopy: "Organize curriculum files and resources into weekly lessons.",
        attendanceTitle: "Attendance",
        attendanceCopy: "Track attendance and daily participation here.",
        reportsTitle: "Reports",
        reportsCopy: "Review generated summaries and parent-facing reports.",
        gradesTitle: "Grades",
        gradesCopy: "Check quizzes, mastery, and grading snapshots.",
        settingsTitle: "Settings",
        settingsCopy: "Adjust streaks and student-specific preferences."
      },
      labels: {
        name: "Name",
        grade: "Grade",
        birthDate: "Birth date",
        notSet: "Not set",
        enrolled: "Enrolled",
        date: "Date",
        startTime: "Start time",
        endTime: "End time",
        totalTime: "Total time"
      },
      gradingSchemeTitle: "Grading scheme",
      gradingSchemeCopy:
        "Choose how raw quiz scores should be translated into grades for this student.",
      gradingSchemeSave: "Save grading scheme",
      gradingSchemeLabel: "Selected grading scheme",
      gradingSchemes: {
        us: {
          title: "US letter grades",
          copy: "Translate scores into A+, A, A-, B+, and related letter grades."
        },
        jp: {
          title: "Japan 5-point scale",
          copy: "Translate scores into the 5 to 1 scale often used in Japanese grading."
        }
      },
      gradingLegend: {
        correct: "Correct",
        incorrect: "Incorrect",
        partial: "Partially correct"
      },
      gradesOverviewTitle: "Subject grades",
      gradesOverviewCopy: "See cumulative grades by subject, based on the latest score for each lesson.",
      gradesByLessonTitle: "Lesson grades",
      gradesByLessonCopy: "Review lesson-level grades and the latest score recorded for each lesson.",
      gradesEmpty: "No graded lessons have been recorded yet.",
      notGradedYet: "Not graded yet",
      gradedLessonsSuffix: "graded lessons",
      gradeColumns: {
        subject: "Subject",
        lesson: "Lesson",
        score: "Score",
        grade: "Grade",
        attempts: "Attempts",
        lastAttempted: "Last attempted"
      },
      placeholders: {
        attendanceTitle: "Attendance",
        attendanceCopy: "Review recorded learning sessions for this student.",
        attendanceEmpty: "No learning activity was recorded in this date range.",
        attendanceFilterFrom: "From",
        attendanceFilterTo: "To",
        attendanceApply: "Apply filter",
        reportsTitle: "Reports",
        reportsCopy: "Parent-facing reports will live here.",
        gradesTitle: "Grades",
        gradesCopy: "Student grading and mastery snapshots will live here."
      },
      streakTitle: "Learning streak",
      streakCopy:
        "Regular days off and planned holidays are skipped automatically. Manage them in the school calendar.",
      currentStreakPrefix: "Current streak",
      currentPeriodPausedSuffix: "is paused",
      currentPeriodCompleteSuffix: "is complete",
      currentPeriodOpenSuffix: "is still open",
      daysLabel: "days",
      weeksLabel: "weeks",
      parentOnly: "Return to the parent profile to manage student curriculum."
    },
    settings: {
      title: "Settings",
      subtitle: "Configure parent account behavior and household defaults here.",
      placeholderTitle: "Parent settings",
      placeholderCopy: "This page is ready for account, notifications, timezone, and other household settings."
    },
    billing: {
      title: "Billing",
      subtitle: "Manage trial access, subscriptions, and receipts.",
      currentPlan: "Current plan",
      premiumPlan: "Premium",
      freePlan: "Free",
      freeTrialPlan: "Introductory month",
      trialStatus: "Trial status",
      billingStatus: "Billing status",
      trialEnds: "Trial ends",
      trialDaysLeft: "days left",
      upgradeMonthly: "Upgrade to subscription",
      upgradeYearly: "Upgrade yearly",
      manageBilling: "Manage billing",
      checkoutUnavailable: "Billing links are not configured yet.",
      accessRestrictedTitle: "Household access is restricted",
      accessRestrictedCopy: "Upgrade billing to restore homeschool planning access after the trial ends.",
      guardDisabled: "Billing guard is currently off in this environment.",
      deletionNotice: "Learning data is scheduled for deletion 30 days after access ends.",
      electiveCount: "Owned electives",
      activeUntil: "Access through",
      cancelAtPeriodEnd: "Cancels at period end"
    },
    electives: {
      title: "Electives",
      subtitle: "Add one-time subject modules outside the core curriculum.",
      owned: "Owned",
      buy: "Buy",
      comingSoon: "Coming soon",
      noElectives: "No electives are listed yet."
    },
    account: {
      title: "Account",
      subtitle: "Manage parent account details and authentication settings here.",
      placeholderTitle: "Parent account",
      placeholderCopy: "This page is ready for profile, email, password, and account security settings.",
      billingLink: "Billing"
    },
    curriculumDetail: {
      openCurriculum: "Open curriculum",
      openSubject: "Open subject",
      previewLesson: "Preview lesson",
      noLessonsYet: "No lessons yet.",
      generating: "Generating",
      needsRetry: "Retrying",
      failed: "Failed",
      queued: "Queued",
      notQueued: "Not queued",
      lessonsSuffix: "lessons",
      lessonSuffix: "lesson",
      nothingQueued: "Nothing queued",
      queuedSuffix: "queued",
      studentFallback: "Student",
      standardLabel: "Standard",
      backToCurriculums: "Back to curriculums"
    }
  },
  student: {
    classroom: {
      title: "Classroom",
      subtitle: "Continue with your assigned curriculum and open the next lesson.",
      noCurriculum: "No curriculum is assigned yet. Ask a parent to add one from the parent dashboard.",
      startLesson: "Start next lesson",
      recentLessons: "Recent lessons",
      noLessons: "No lessons have been generated yet.",
      backToParent: "Back to parent",
      billingRestricted: "A parent needs to update billing before lesson access can continue."
    },
    lesson: {
      back: "Back to classroom",
      objective: "Objective",
      listen: "Listen and learn"
    }
  }
} as const;

export default en;
