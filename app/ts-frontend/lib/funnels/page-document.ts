export type FunnelPageTheme = "sage" | "cream" | "violet" | "sky";
export type FunnelPageTone = "default" | "muted" | "accent" | "dark";
export type FunnelPageWidth = "narrow" | "standard" | "wide";
export type FunnelTextAlign = "left" | "center" | "right";
export type FunnelButtonWidth = "fit" | "full";
export type FunnelButtonIcon =
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "chevron-right"
  | "chevron-left"
  | "chevron-up"
  | "chevron-down"
  | "check"
  | "plus"
  | "minus"
  | "info"
  | "help-circle"
  | "alert-triangle"
  | "shopping-cart"
  | "download"
  | "book-open"
  | "star"
  | "sparkles"
  | "lock"
  | "play"
  | "mail"
  | "gift"
  | "heart"
  | "calendar"
  | "external-link"
  | "phone"
  | "map-pin"
  | "clock"
  | "user"
  | "users"
  | "home"
  | "globe"
  | "search"
  | "settings"
  | "wand"
  | "rocket"
  | "trophy"
  | "graduation-cap"
  | "music"
  | "camera"
  | "image"
  | "file-text"
  | "printer"
  | "share"
  | "refresh"
  | "thumbs-up"
  | "smile"
  | "circle"
  | "zap"
  | "flame"
  | "sun"
  | "moon"
  | "leaf"
  | "menu"
  | "log-in"
  | "upload"
  | "save"
  | "copy"
  | "edit"
  | "trash"
  | "eye"
  | "credit-card"
  | "tag"
  | "percent"
  | "dollar-sign"
  | "package"
  | "pencil"
  | "lightbulb"
  | "headphones"
  | "video"
  | "microphone"
  | "bell"
  | "message-circle";
export type FunnelButtonIconPosition = "left" | "right";
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
  hoverBackgroundColor?: string;
  hoverScale?: number;
};

export type FunnelListTypography = {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  fontWeight?: number;
  color?: string;
};

export type FunnelTextTypography = {
  fontFamily?: string;
  fontSize?: number;
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
      props: { text: string; level: "h1" | "h2" | "h3"; align: FunnelTextAlign; typography?: FunnelTextTypography };
    })
  | (FunnelElementBase & {
      type: "text";
      props: { text: string; style: "lead" | "body" | "small"; align: FunnelTextAlign; typography?: FunnelTextTypography };
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
      props: { media: FunnelMediaSnapshot; fit: "contain" | "cover"; caption: string; sizePercent?: number; align?: FunnelTextAlign };
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
        icon?: FunnelButtonIcon | "none";
        iconPosition?: FunnelButtonIconPosition;
        /** Retained so legacy page revisions keep their original arrow behavior. */
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
  verticalAlign?: "top" | "center" | "bottom";
  spacing?: FunnelElementSpacing;
  elements: FunnelPageElement[];
  rows?: FunnelPageRow[];
};

export type FunnelPageRow = {
  id: string;
  spacing?: FunnelElementSpacing;
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
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
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

export function resolveFunnelImageSizePercent(sizePercent?: number) {
  return Math.max(10, Math.min(100, Math.round(sizePercent ?? 100)));
}

export function funnelImageAlignmentStyle(align?: FunnelTextAlign) {
  if (align === "left") return { marginLeft: 0, marginRight: "auto" } as const;
  if (align === "right") return { marginLeft: "auto", marginRight: 0 } as const;
  return { marginLeft: "auto", marginRight: "auto" } as const;
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
    ...(column.rows ? { rows: [...column.rows] } : {}),
  }));

  if (columns.length > columnCount) {
    const removed = columns.splice(columnCount);
    const destination = columns[columns.length - 1];
    if (destination) {
      destination.elements.push(
        ...removed.flatMap((column) => column.elements),
      );
      const removedRows = removed.flatMap((column) => column.rows ?? []);
      if (removedRows.length > 0) destination.rows = [...(destination.rows ?? []), ...removedRows];
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
    ...(column.rows ? { rows: [...column.rows] } : {}),
  }));
  const [removed] = columns.splice(columnIndex, 1);
  const destinationIndex = Math.min(columnIndex, columns.length - 1);
  const destination = columns[destinationIndex];
  if (removed && destination) {
    if (columnIndex < row.columns.length - 1) destination.elements.unshift(...removed.elements);
    else destination.elements.push(...removed.elements);
    if (removed.rows?.length) {
      if (columnIndex < row.columns.length - 1) destination.rows = [...removed.rows, ...(destination.rows ?? [])];
      else destination.rows = [...(destination.rows ?? []), ...removed.rows];
    }
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
  return document.sections.some((section) => rowsHaveForwardAction(section.rows));
}

function rowsHaveForwardAction(rows: FunnelPageRow[]): boolean {
  return rows.some((row) => row.columns.some((column) =>
    column.elements.some((element) => {
      if (element.type !== "button" && element.type !== "lead_capture") return false;
      return element.props.action.type !== "none";
    }) || rowsHaveForwardAction(column.rows ?? [])
  ));
}

function findInFunnelRows(
  rows: FunnelPageRow[],
  find: (column: FunnelPageColumn) => string | null,
): string {
  for (const row of rows) {
    for (const column of row.columns) {
      const value = find(column);
      if (value) return value;
      const nested = findInFunnelRows(column.rows ?? [], find);
      if (nested) return nested;
    }
  }
  return "";
}

export function getFunnelDocumentTitle(document: FunnelPageDocument) {
  for (const section of document.sections) {
    const title = findInFunnelRows(section.rows, (column) => {
      const heading = column.elements.find((element) =>
        element.type === "heading" && element.props.level === "h1"
      );
      return heading?.type === "heading" ? heading.props.text : null;
    });
    if (title) return title;
  }
  return "";
}

export function getFunnelDocumentDescription(document: FunnelPageDocument) {
  for (const section of document.sections) {
    const description = findInFunnelRows(section.rows, (column) => {
      const text = column.elements.find((element) =>
        element.type === "text" && (element.props.style === "lead" || element.props.style === "body")
      );
      return text?.type === "text" ? text.props.text : null;
    });
    if (description) return description;
  }
  return "";
}
