export type FunnelPageTheme = "sage" | "cream" | "violet" | "sky";
export type FunnelPageTone = "default" | "muted" | "accent" | "dark";
export type FunnelPageWidth = "narrow" | "standard" | "wide";
export type FunnelTextAlign = "left" | "center" | "right";
export type FunnelButtonWidth = "fit" | "full";
export type FunnelListMarker = "check" | "bullet" | "arrow" | "star";

export type FunnelCountdownDuration = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export type FunnelCountdownExpiryAction =
  | { type: "none" }
  | { type: "hide" }
  | { type: "message"; message: string }
  | { type: "redirect"; target: string };

export type FunnelCountdownTypography = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
};

export type FunnelButtonTypography = {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  fontWeight?: number;
  color?: string;
};

export type FunnelButtonAppearance = {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  paddingX?: number;
  paddingY?: number;
  width?: FunnelButtonWidth;
  shadowColor?: string;
  shadowDepth?: number;
};

export type FunnelListTypography = {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  fontWeight?: number;
  color?: string;
};

export type FunnelListAppearance = {
  layout?: "stacked" | "inline";
  marker?: FunnelListMarker;
  markerSize?: number;
  markerColor?: string;
  markerBadge?: boolean;
  markerBadgeColor?: string;
  markerBadgeSize?: number;
  itemSpacing?: number;
  markerGap?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  paddingX?: number;
  paddingY?: number;
};

export type FunnelPageStyles = {
  typography?: {
    headingFontFamily?: string;
    bodyFontFamily?: string;
    headingColor?: string;
    bodyColor?: string;
    baseFontSize?: number;
  };
  colors?: {
    pageBackground?: string;
    surface?: string;
    primary?: string;
    secondary?: string;
  };
  layout?: {
    contentWidth?: number;
    sectionGap?: number;
    sectionPaddingY?: number;
    columnGap?: number;
  };
  buttons?: {
    borderRadius?: number;
  };
};

export type FunnelAction =
  | { type: "next_step" }
  | { type: "url"; target: string }
  | { type: "checkout"; offerKey: string; target?: string | null }
  | { type: "accept_offer"; offerKey: string; target?: string | null }
  | { type: "decline_offer"; offerKey: string; target?: string | null }
  | { type: "none" };

export type FunnelMediaSnapshot = {
  assetId: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  alt: string;
  width: number | null;
  height: number | null;
};

export type FunnelWorkbookGalleryAppearance = {
  preset?: "funnel_card" | "bookstore_frameless";
  aspectRatio?: "3:4" | "4:5" | "square";
  frameBackgroundColor?: string;
  frameBorderColor?: string;
  frameBorderWidth?: number;
  frameBorderRadius?: number;
  framePadding?: number;
  restingShadow?: boolean;
  imageScale?: number;
  zoomOnHover?: boolean;
  darkenOnHover?: boolean;
  hoverBrightness?: number;
  hoverLift?: boolean;
  hoverShadow?: boolean;
  showOverlay?: boolean;
  overlayText?: string;
  overlayBackgroundColor?: string;
  overlayTextColor?: string;
};

export type FunnelElementSpacing = {
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
};

type FunnelElementBase = {
  id: string;
  visibility?: { desktop?: boolean; mobile?: boolean };
  spacing?: FunnelElementSpacing;
};

export type FunnelPageElement =
  | (FunnelElementBase & {
      type: "eyebrow";
      props: { text: string; align: FunnelTextAlign };
    })
  | (FunnelElementBase & {
      type: "heading";
      props: { text: string; level: "h1" | "h2" | "h3"; align: FunnelTextAlign };
    })
  | (FunnelElementBase & {
      type: "text";
      props: { text: string; style: "lead" | "body" | "small"; align: FunnelTextAlign };
    })
  | (FunnelElementBase & {
      type: "list";
      props: {
        items: string[];
        style: "checks" | "bullets";
        align: FunnelTextAlign;
        typography?: FunnelListTypography;
        appearance?: FunnelListAppearance;
      };
    })
  | (FunnelElementBase & {
      type: "image";
      props: { media: FunnelMediaSnapshot; fit: "contain" | "cover"; caption: string };
    })
  | (FunnelElementBase & {
      type: "workbook_gallery";
      props: {
        title: string;
        cover: FunnelMediaSnapshot;
        images: FunnelMediaSnapshot[];
        previewSlug?: string;
        fit: "contain" | "cover";
        caption: string;
        appearance?: FunnelWorkbookGalleryAppearance;
      };
    })
  | (FunnelElementBase & {
      type: "button";
      props: {
        label: string;
        subtext?: string;
        variant: "primary" | "secondary" | "text";
        align: FunnelTextAlign;
        typography?: FunnelButtonTypography;
        subtextTypography?: FunnelButtonTypography;
        appearance?: FunnelButtonAppearance;
        showArrow?: boolean;
        action: FunnelAction;
      };
    })
  | (FunnelElementBase & {
      type: "lead_capture";
      props: {
        heading: string;
        collectFirstName: boolean;
        firstNameLabel: string;
        emailLabel: string;
        submitLabel: string;
        action: FunnelAction;
      };
    })
  | (FunnelElementBase & {
      type: "countdown";
      props: {
        mode: "delay" | "deadline";
        duration: FunnelCountdownDuration;
        deadline?: string;
        expiryAction: FunnelCountdownExpiryAction;
        align: FunnelTextAlign;
        showDays: boolean;
        showLabels: boolean;
        separator: string;
        typography?: FunnelCountdownTypography;
        labelTypography?: FunnelCountdownTypography;
      };
    })
  | (FunnelElementBase & {
      type: "progress_steps";
      props: {
        steps: string[];
        currentStep: number;
        showNumbers: boolean;
      };
    })
  | (FunnelElementBase & {
      type: "divider";
      props: Record<string, never>;
    });

export type FunnelPageColumn = {
  id: string;
  span: number;
  offset?: number;
  elements: FunnelPageElement[];
};

export type FunnelPageRow = {
  id: string;
  columns: FunnelPageColumn[];
};
export type FunnelRowColumnCount = 1 | 2 | 3 | 4;

export type FunnelPageSection = {
  id: string;
  props: {
    tone: FunnelPageTone;
    width: FunnelPageWidth;
    background: FunnelMediaSnapshot | null;
    backgroundColor?: string;
    paddingX?: number;
    paddingY?: number;
    marginTop?: number;
    marginBottom?: number;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    borderStyle?: "solid" | "dashed" | "dotted";
  };
  rows: FunnelPageRow[];
};

export type FunnelPageDocument = {
  schemaVersion: 2;
  kind: "funnel_page";
  theme: FunnelPageTheme;
  siteChrome?: {
    showHeader: boolean;
    showFooter: boolean;
  };
  styles?: FunnelPageStyles;
  assets?: FunnelMediaSnapshot[];
  sections: FunnelPageSection[];
};

export function createFunnelDocumentId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createFunnelPageRow(
  columnCount: FunnelRowColumnCount,
): FunnelPageRow {
  return {
    id: createFunnelDocumentId("row"),
    columns: Array.from({ length: columnCount }, () => ({
      id: createFunnelDocumentId("column"),
      span: 12 / columnCount,
      elements: [],
    })),
  };
}

export function resizeFunnelPageRow(
  row: FunnelPageRow,
  columnCount: FunnelRowColumnCount,
): FunnelPageRow {
  const columns = row.columns.map((column) => ({
    ...column,
    elements: [...column.elements],
  }));

  if (columns.length > columnCount) {
    const removed = columns.splice(columnCount);
    const destination = columns[columns.length - 1];
    if (destination) {
      destination.elements.push(
        ...removed.flatMap((column) => column.elements),
      );
    }
  } else {
    while (columns.length < columnCount) {
      columns.push({
        id: createFunnelDocumentId("column"),
        span: 12 / columnCount,
        elements: [],
      });
    }
  }

  for (const column of columns) {
    column.span = 12 / columnCount;
    delete column.offset;
  }

  return { ...row, columns };
}

export function removeFunnelPageColumn(
  row: FunnelPageRow,
  columnIndex: number,
): FunnelPageRow {
  if (row.columns.length <= 1 || !row.columns[columnIndex]) return row;
  const columns = row.columns.map((column) => ({
    ...column,
    elements: [...column.elements],
  }));
  const [removed] = columns.splice(columnIndex, 1);
  const destinationIndex = Math.min(columnIndex, columns.length - 1);
  const destination = columns[destinationIndex];
  if (removed && destination) {
    if (columnIndex < row.columns.length - 1) destination.elements.unshift(...removed.elements);
    else destination.elements.push(...removed.elements);
  }
  const span = 12 / columns.length;
  for (const column of columns) {
    column.span = span;
    delete column.offset;
  }
  return { ...row, columns };
}

export function emptyFunnelPageDocument(headline: string, subheadline = ""): FunnelPageDocument {
  return {
    schemaVersion: 2,
    kind: "funnel_page",
    theme: "sage",
    siteChrome: { showHeader: false, showFooter: false },
    assets: [],
    sections: [{
      id: createFunnelDocumentId("section"),
      props: { tone: "default", width: "standard", background: null },
      rows: [{
        id: createFunnelDocumentId("row"),
        columns: [{
          id: createFunnelDocumentId("column"),
          span: 12,
          elements: [
            {
              id: createFunnelDocumentId("heading"),
              type: "heading",
              props: { text: headline, level: "h1", align: "left" }
            },
            ...(subheadline ? [{
              id: createFunnelDocumentId("text"),
              type: "text" as const,
              props: { text: subheadline, style: "lead" as const, align: "left" as const }
            }] : []),
            {
              id: createFunnelDocumentId("button"),
              type: "button",
              props: {
                label: "Continue",
                variant: "primary",
                align: "left",
                action: { type: "next_step" }
              }
            }
          ]
        }]
      }]
    }]
  };
}

export function isFunnelPageDocument(value: unknown): value is FunnelPageDocument {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FunnelPageDocument>;
  return candidate.schemaVersion === 2
    && candidate.kind === "funnel_page"
    && Array.isArray(candidate.sections);
}

export function funnelDocumentHasForwardAction(document: FunnelPageDocument) {
  return document.sections.some((section) => section.rows.some((row) =>
    row.columns.some((column) => column.elements.some((element) => {
      if (element.type !== "button" && element.type !== "lead_capture") return false;
      return element.props.action.type !== "none";
    }))
  ));
}

export function getFunnelDocumentTitle(document: FunnelPageDocument) {
  for (const section of document.sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        const heading = column.elements.find((element) =>
          element.type === "heading" && element.props.level === "h1"
        );
        if (heading?.type === "heading") return heading.props.text;
      }
    }
  }
  return "";
}

export function getFunnelDocumentDescription(document: FunnelPageDocument) {
  for (const section of document.sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        const text = column.elements.find((element) =>
          element.type === "text" && (element.props.style === "lead" || element.props.style === "body")
        );
        if (text?.type === "text") return text.props.text;
      }
    }
  }
  return "";
}
