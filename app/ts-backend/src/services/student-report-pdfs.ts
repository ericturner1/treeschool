import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { drawPdfText } from "./pdf-text-fonts";

export type AttendanceReportWorkbook = {
  courseLabel: string;
  workbookTitle: string;
  completedLessons: number;
  totalLessons: number;
  progressPercent: number | null;
  lastLessonCompleted: string | null;
};

export type AttendanceReportDay = {
  date: string;
  subjectLabels: string[];
  lessonsCompleted: string[];
  otherActivities: string[];
  minutes: number;
};

export type AttendanceReportPdfData = {
  studentName: string;
  yearTitle: string;
  yearStatus: string;
  dateFrom: string | null;
  dateTo: string | null;
  printPageSize: string;
  generatedAt: string;
  summary: {
    learningDays: number;
    lessonsCompleted: number;
    otherActivities: number;
    minutes: number;
  };
  workbooks: AttendanceReportWorkbook[];
  days: AttendanceReportDay[];
};

export type ReportCardSubject = {
  subjectLabel: string;
  gradedEntries: number;
  averageScore: number | null;
  grade: string | null;
};

export type ReportCardPdfData = {
  studentName: string;
  gradeLevel: number | null;
  yearTitle: string;
  yearStatus: string;
  dateFrom: string | null;
  dateTo: string | null;
  printPageSize: string;
  generatedAt: string;
  gradingSchemeName: string;
  overallAverage: number | null;
  overallGrade: string | null;
  gradedEntries: number;
  completedWeeks: number;
  totalWeeks: number;
  learningDays: number;
  subjects: ReportCardSubject[];
};

const COLORS = {
  ink: rgb(0.055, 0.09, 0.16),
  muted: rgb(0.39, 0.41, 0.43),
  leaf: rgb(0.45, 0.62, 0.34),
  leafDark: rgb(0.29, 0.43, 0.22),
  paleLeaf: rgb(0.92, 0.96, 0.88),
  cream: rgb(0.985, 0.965, 0.92),
  sand: rgb(0.95, 0.91, 0.83),
  earth: rgb(0.48, 0.35, 0.24),
  white: rgb(1, 1, 1),
  line: rgb(0.86, 0.8, 0.7),
};

const ATTENDANCE_HEAT_COLORS = [
  rgb(0.96, 0.95, 0.91),
  rgb(0.86, 0.92, 0.79),
  rgb(0.69, 0.81, 0.57),
  rgb(0.45, 0.62, 0.34),
  rgb(0.29, 0.43, 0.22),
] as const;

const PAGE_MARGIN = 38;

function pageSize(value: string): readonly [number, number] {
  return value.toLowerCase() === "a4" ? [595.28, 841.89] : [612, 792];
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return "Not logged";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function percentLabel(value: number | null) {
  return value == null ? "Not available" : `${value}%`;
}

let logoBytesPromise: Promise<Uint8Array | null> | null = null;

function loadLogoBytes() {
  if (!logoBytesPromise) {
    logoBytesPromise = Promise.any([
      join(process.cwd(), "app", "ts-frontend", "public", "tree-icon.png"),
      join(process.cwd(), "..", "ts-frontend", "public", "tree-icon.png"),
      join(process.cwd(), "src", "workbook-assets", "tree-icon.png"),
    ].map((path) => readFile(path).then((bytes) => new Uint8Array(bytes))))
      .catch(() => null);
  }
  return logoBytesPromise;
}

class ReportPdfWriter {
  readonly document: PDFDocument;
  readonly font: PDFFont;
  readonly bold: PDFFont;
  readonly dimensions: readonly [number, number];
  readonly title: string;
  readonly studentName: string;
  page!: PDFPage;
  cursorY = 0;

  private constructor(input: {
    document: PDFDocument;
    font: PDFFont;
    bold: PDFFont;
    dimensions: readonly [number, number];
    title: string;
    studentName: string;
  }) {
    this.document = input.document;
    this.font = input.font;
    this.bold = input.bold;
    this.dimensions = input.dimensions;
    this.title = input.title;
    this.studentName = input.studentName;
  }

  static async create(input: {
    title: string;
    studentName: string;
    printPageSize: string;
  }) {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    document.setTitle(`${input.studentName} - ${input.title}`);
    document.setAuthor("Treeschool");
    document.setCreator("Treeschool");
    return new ReportPdfWriter({
      document,
      font,
      bold,
      dimensions: pageSize(input.printPageSize),
      title: input.title,
      studentName: input.studentName,
    });
  }

  async addPage(options: { first?: boolean; subtitle?: string } = {}) {
    const [width, height] = this.dimensions;
    this.page = this.document.addPage([width, height]);
    this.page.drawRectangle({ x: 0, y: 0, width, height, color: COLORS.cream });
    const headerHeight = options.first ? 126 : 68;
    this.page.drawRectangle({
      x: 0,
      y: height - headerHeight,
      width,
      height: headerHeight,
      color: options.first ? COLORS.leaf : COLORS.paleLeaf,
    });

    const logoBytes = await loadLogoBytes();
    let brandX = PAGE_MARGIN;
    if (logoBytes) {
      const logo = await this.document.embedPng(logoBytes);
      const logoSize = options.first ? 32 : 22;
      this.page.drawImage(logo, {
        x: PAGE_MARGIN,
        y: height - (options.first ? 47 : 36),
        width: logoSize,
        height: logoSize,
      });
      brandX += logoSize + 7;
    }
    this.page.drawText("treeschool", {
      x: brandX,
      y: height - (options.first ? 37 : 29),
      size: options.first ? 13 : 10.5,
      font: this.bold,
      color: options.first ? COLORS.white : COLORS.leafDark,
    });

    if (options.first) {
      await this.text(this.title, PAGE_MARGIN, height - 82, 25, this.bold, COLORS.white, {
        bold: true,
        maxWidth: width - PAGE_MARGIN * 2,
      });
      if (options.subtitle) {
        await this.text(options.subtitle, PAGE_MARGIN, height - 106, 10.5, this.font, COLORS.paleLeaf, {
          maxWidth: width - PAGE_MARGIN * 2,
        });
      }
      this.cursorY = height - headerHeight - 28;
    } else {
      await this.text(`${this.studentName} - ${this.title}`, brandX + 78, height - 29, 10.5, this.bold, COLORS.leafDark, {
        bold: true,
        maxWidth: width - brandX - 118,
      });
      this.cursorY = height - headerHeight - 26;
    }
  }

  async text(
    value: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    color: RGB,
    options: { bold?: boolean; maxWidth?: number } = {},
  ) {
    await drawPdfText({
      document: this.document,
      page: this.page,
      text: value,
      x,
      y,
      size,
      font,
      color,
      bold: options.bold,
      maxWidth: options.maxWidth,
    });
  }

  async ensureSpace(heightNeeded: number) {
    if (this.cursorY - heightNeeded >= 54) return;
    await this.addPage();
  }

  async sectionHeading(label: string) {
    await this.ensureSpace(34);
    await this.text(label.toUpperCase(), PAGE_MARGIN, this.cursorY, 10, this.bold, COLORS.leafDark, {
      bold: true,
      maxWidth: this.dimensions[0] - PAGE_MARGIN * 2,
    });
    this.cursorY -= 22;
  }

  async finish() {
    const pages = this.document.getPages();
    for (const [index, page] of pages.entries()) {
      const { width } = page.getSize();
      page.drawLine({
        start: { x: PAGE_MARGIN, y: 35 },
        end: { x: width - PAGE_MARGIN, y: 35 },
        thickness: 0.7,
        color: COLORS.line,
      });
      page.drawText(`Generated by Treeschool - Page ${index + 1} of ${pages.length}`, {
        x: PAGE_MARGIN,
        y: 20,
        size: 7.5,
        font: this.font,
        color: COLORS.muted,
      });
    }
    return this.document.save();
  }
}

async function drawMetricCards(
  writer: ReportPdfWriter,
  metrics: Array<{ label: string; value: string }>,
) {
  const width = writer.dimensions[0] - PAGE_MARGIN * 2;
  const gap = 8;
  const cardWidth = (width - gap * (metrics.length - 1)) / metrics.length;
  const cardHeight = 54;
  await writer.ensureSpace(cardHeight + 12);
  for (const [index, metric] of metrics.entries()) {
    const x = PAGE_MARGIN + index * (cardWidth + gap);
    writer.page.drawRectangle({
      x,
      y: writer.cursorY - cardHeight,
      width: cardWidth,
      height: cardHeight,
      color: COLORS.white,
      borderColor: COLORS.line,
      borderWidth: 0.7,
    });
    await writer.text(metric.label.toUpperCase(), x + 10, writer.cursorY - 18, 7.4, writer.bold, COLORS.earth, {
      bold: true,
      maxWidth: cardWidth - 20,
    });
    await writer.text(metric.value, x + 10, writer.cursorY - 40, 17, writer.bold, COLORS.ink, {
      bold: true,
      maxWidth: cardWidth - 20,
    });
  }
  writer.cursorY -= cardHeight + 20;
}

const DAY_MS = 86_400_000;

function parseReportDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addReportDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function reportDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function attendanceDateRange(data: AttendanceReportPdfData) {
  const recordedDays = data.days
    .map((day) => parseReportDay(day.date))
    .filter((day): day is Date => Boolean(day));
  const start = parseReportDay(data.dateFrom) ?? recordedDays.at(0) ?? null;
  const end = parseReportDay(data.dateTo) ?? recordedDays.at(-1) ?? null;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function heatLevel(day: AttendanceReportDay | undefined) {
  if (!day) return 0;
  const activityCount = day.lessonsCompleted.length + day.otherActivities.length;
  if (activityCount >= 4) return 4;
  return Math.max(1, activityCount);
}

async function drawAttendanceHeatmap(writer: ReportPdfWriter, data: AttendanceReportPdfData) {
  const range = attendanceDateRange(data);
  if (!range) {
    await writer.text("No learning-year dates are available for the attendance graph.", PAGE_MARGIN, writer.cursorY, 9, writer.font, COLORS.muted, {
      maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2,
    });
    writer.cursorY -= 22;
    return;
  }

  await writer.text(
    "Each square is one day. Darker greens indicate more completed lessons or activities.",
    PAGE_MARGIN,
    writer.cursorY,
    8,
    writer.font,
    COLORS.muted,
    { maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2 },
  );
  writer.cursorY -= 18;

  const startOfFirstWeek = addReportDays(range.start, -range.start.getUTCDay());
  const endOfLastWeek = addReportDays(range.end, 6 - range.end.getUTCDay());
  const totalWeeks = Math.floor((endOfLastWeek.getTime() - startOfFirstWeek.getTime()) / (DAY_MS * 7)) + 1;
  const bandCount = Math.max(1, Math.ceil(totalWeeks / 36));
  const weeksPerBand = Math.ceil(totalWeeks / bandCount);
  const cellSize = 8.5;
  const cellGap = 1.8;
  const cellStep = cellSize + cellGap;
  const dayLabelWidth = 19;
  const cellStartX = PAGE_MARGIN + dayLabelWidth;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const attendanceByDate = new Map(data.days.map((day) => [day.date.slice(0, 10), day]));
  const bandHeight = 16 + cellStep * 7 + 10;

  for (let bandIndex = 0; bandIndex < bandCount; bandIndex += 1) {
    await writer.ensureSpace(bandHeight + 8);
    const firstWeekIndex = bandIndex * weeksPerBand;
    const weeksInBand = Math.min(weeksPerBand, totalWeeks - firstWeekIndex);
    const bandTop = writer.cursorY;
    const monthMarkers: Array<{ label: string; weekIndex: number; startsMonth: boolean }> = [];
    let lastMonthKey = "";

    for (let weekIndex = 0; weekIndex < weeksInBand; weekIndex += 1) {
      const absoluteWeekIndex = firstWeekIndex + weekIndex;
      const weekStart = addReportDays(startOfFirstWeek, absoluteWeekIndex * 7);
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const day = addReportDays(weekStart, dayIndex);
        if (day < range.start || day > range.end) continue;
        const monthKey = `${day.getUTCFullYear()}-${day.getUTCMonth()}`;
        if (monthKey !== lastMonthKey) {
          monthMarkers.push({
            label: monthNames[day.getUTCMonth()]!,
            weekIndex,
            startsMonth: day.getUTCDate() === 1,
          });
          lastMonthKey = monthKey;
        }
      }
    }

    for (const [markerIndex, marker] of monthMarkers.entries()) {
      const next = monthMarkers[markerIndex + 1];
      if (!marker.startsMonth && next && next.weekIndex - marker.weekIndex < 3) continue;
      await writer.text(
        marker.label,
        cellStartX + marker.weekIndex * cellStep,
        bandTop - 7,
        7,
        writer.bold,
        COLORS.earth,
        { bold: true, maxWidth: 24 },
      );
    }

    const weekdayLabels = new Map([[1, "M"], [3, "W"], [5, "F"]]);
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const cellY = bandTop - 16 - cellSize - dayIndex * cellStep;
      const weekdayLabel = weekdayLabels.get(dayIndex);
      if (weekdayLabel) {
        await writer.text(weekdayLabel, PAGE_MARGIN + 5, cellY + 1, 6.5, writer.font, COLORS.muted, { maxWidth: 10 });
      }
      for (let weekIndex = 0; weekIndex < weeksInBand; weekIndex += 1) {
        const absoluteWeekIndex = firstWeekIndex + weekIndex;
        const day = addReportDays(startOfFirstWeek, absoluteWeekIndex * 7 + dayIndex);
        const withinRange = day >= range.start && day <= range.end;
        const level = withinRange ? heatLevel(attendanceByDate.get(reportDayKey(day))) : 0;
        writer.page.drawRectangle({
          x: cellStartX + weekIndex * cellStep,
          y: cellY,
          width: cellSize,
          height: cellSize,
          color: withinRange ? ATTENDANCE_HEAT_COLORS[level]! : COLORS.cream,
          borderColor: withinRange ? COLORS.line : COLORS.cream,
          borderWidth: 0.35,
        });
      }
    }
    writer.cursorY -= bandHeight;
  }

  const legendX = writer.dimensions[0] - PAGE_MARGIN - 100;
  await writer.text("Less", legendX - 25, writer.cursorY + 2, 6.5, writer.font, COLORS.muted, { maxWidth: 22 });
  for (let level = 0; level < ATTENDANCE_HEAT_COLORS.length; level += 1) {
    writer.page.drawRectangle({
      x: legendX + level * 11,
      y: writer.cursorY,
      width: 8,
      height: 8,
      color: ATTENDANCE_HEAT_COLORS[level]!,
      borderColor: COLORS.line,
      borderWidth: 0.3,
    });
  }
  await writer.text("More", legendX + 59, writer.cursorY + 2, 6.5, writer.font, COLORS.muted, { maxWidth: 28 });
  writer.cursorY -= 16;
}

export async function buildAttendanceReportPdf(data: AttendanceReportPdfData) {
  const writer = await ReportPdfWriter.create({
    title: "Annual attendance and progress report",
    studentName: data.studentName,
    printPageSize: data.printPageSize,
  });
  await writer.addPage({
    first: true,
    subtitle: `${data.yearTitle} | ${formatDate(data.dateFrom)} to ${formatDate(data.dateTo)} | Generated ${formatGeneratedAt(data.generatedAt)}`,
  });

  await writer.text(data.studentName, PAGE_MARGIN, writer.cursorY, 20, writer.bold, COLORS.ink, {
    bold: true,
    maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2,
  });
  writer.cursorY -= 30;
  await drawMetricCards(writer, [
    { label: "Learning days", value: String(data.summary.learningDays) },
    { label: "Lessons completed", value: String(data.summary.lessonsCompleted) },
    { label: "Other activities", value: String(data.summary.otherActivities) },
    { label: "Estimated learning time", value: formatDuration(data.summary.minutes) },
  ]);
  await writer.text(
    "Learning time combines completed lesson estimates with manually logged activity time.",
    PAGE_MARGIN,
    writer.cursorY + 9,
    7.5,
    writer.font,
    COLORS.muted,
    { maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2 },
  );
  writer.cursorY -= 7;

  await writer.sectionHeading("Attendance activity");
  await drawAttendanceHeatmap(writer, data);

  await writer.sectionHeading("Course and workbook progress");
  if (data.workbooks.length === 0) {
    await writer.text("No workbook progress is available for this learning year.", PAGE_MARGIN, writer.cursorY, 10.5, writer.font, COLORS.muted, {
      maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2,
    });
    writer.cursorY -= 30;
  } else {
    for (const workbook of data.workbooks) {
      await writer.ensureSpace(58);
      const x = PAGE_MARGIN;
      const width = writer.dimensions[0] - PAGE_MARGIN * 2;
      const rowY = writer.cursorY - 49;
      writer.page.drawRectangle({
        x,
        y: rowY,
        width,
        height: 49,
        color: COLORS.white,
        borderColor: COLORS.line,
        borderWidth: 0.65,
      });
      await writer.text(workbook.courseLabel, x + 10, writer.cursorY - 16, 7.5, writer.bold, COLORS.earth, {
        bold: true,
        maxWidth: 145,
      });
      await writer.text(workbook.workbookTitle, x + 10, writer.cursorY - 34, 11, writer.bold, COLORS.ink, {
        bold: true,
        maxWidth: 205,
      });

      const progressX = x + 226;
      const progressWidth = 105;
      writer.page.drawRectangle({ x: progressX, y: writer.cursorY - 34, width: progressWidth, height: 8, color: COLORS.sand });
      if (workbook.progressPercent != null) {
        writer.page.drawRectangle({
          x: progressX,
          y: writer.cursorY - 34,
          width: progressWidth * Math.max(0, Math.min(100, workbook.progressPercent)) / 100,
          height: 8,
          color: COLORS.leaf,
        });
      }
      await writer.text(percentLabel(workbook.progressPercent), progressX, writer.cursorY - 17, 9, writer.bold, COLORS.leafDark, {
        bold: true,
        maxWidth: progressWidth,
      });
      await writer.text(`${workbook.completedLessons} of ${workbook.totalLessons} lessons`, progressX, writer.cursorY - 47, 7.5, writer.font, COLORS.muted, {
        maxWidth: progressWidth,
      });
      await writer.text("Last completed", x + 350, writer.cursorY - 16, 7.5, writer.bold, COLORS.earth, {
        bold: true,
        maxWidth: width - 360,
      });
      await writer.text(workbook.lastLessonCompleted ?? "Not started", x + 350, writer.cursorY - 35, 9.5, writer.font, COLORS.ink, {
        maxWidth: width - 360,
      });
      writer.cursorY -= 56;
    }
  }

  writer.cursorY -= 4;
  await writer.sectionHeading("Attendance log");
  if (data.days.length === 0) {
    await writer.text("No attendance has been recorded for this learning year.", PAGE_MARGIN, writer.cursorY, 10.5, writer.font, COLORS.muted, {
      maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2,
    });
  } else {
    for (const day of data.days) {
      await writer.ensureSpace(57);
      const x = PAGE_MARGIN;
      const width = writer.dimensions[0] - PAGE_MARGIN * 2;
      const rowY = writer.cursorY - 49;
      writer.page.drawRectangle({
        x,
        y: rowY,
        width,
        height: 49,
        color: COLORS.white,
        borderColor: COLORS.line,
        borderWidth: 0.55,
      });
      await writer.text(formatDate(day.date), x + 10, writer.cursorY - 20, 9.5, writer.bold, COLORS.ink, {
        bold: true,
        maxWidth: 82,
      });
      await writer.text(day.subjectLabels.join(", ") || "Other learning", x + 100, writer.cursorY - 16, 8.5, writer.bold, COLORS.leafDark, {
        bold: true,
        maxWidth: 126,
      });
      const lessonSummary = day.lessonsCompleted.length > 0
        ? day.lessonsCompleted.join("; ")
        : day.otherActivities.join("; ") || "Learning day recorded";
      await writer.text(lessonSummary, x + 100, writer.cursorY - 36, 9, writer.font, COLORS.ink, {
        maxWidth: width - 255,
      });
      const countLabel = day.lessonsCompleted.length > 0
        ? `${day.lessonsCompleted.length} ${day.lessonsCompleted.length === 1 ? "lesson" : "lessons"}`
        : `${day.otherActivities.length} ${day.otherActivities.length === 1 ? "activity" : "activities"}`;
      await writer.text(countLabel, x + width - 115, writer.cursorY - 19, 9, writer.bold, COLORS.earth, {
        bold: true,
        maxWidth: 105,
      });
      await writer.text(day.minutes > 0 ? formatDuration(day.minutes) : "", x + width - 115, writer.cursorY - 38, 8, writer.font, COLORS.muted, {
        maxWidth: 105,
      });
      writer.cursorY -= 55;
    }
  }

  return writer.finish();
}

function reportCardStatusLabel(status: string) {
  return status === "completed" ? "Final Report Card" : "Report Card";
}

function studentGradeLabel(gradeLevel: number | null) {
  if (gradeLevel == null) return "Grade not set";
  return gradeLevel === 0 ? "Kindergarten" : `Grade ${gradeLevel}`;
}

export async function buildReportCardPdf(data: ReportCardPdfData) {
  const documentTitle = reportCardStatusLabel(data.yearStatus);
  const writer = await ReportPdfWriter.create({
    title: documentTitle,
    studentName: data.studentName,
    printPageSize: data.printPageSize,
  });
  await writer.addPage({
    first: true,
    subtitle: `${data.yearTitle} | ${formatDate(data.dateFrom)} to ${formatDate(data.dateTo)} | Generated ${formatGeneratedAt(data.generatedAt)}`,
  });

  await writer.text(data.studentName, PAGE_MARGIN, writer.cursorY, 22, writer.bold, COLORS.ink, {
    bold: true,
    maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2 - 100,
  });
  const badgeText = data.overallGrade ?? "Not graded";
  const badgeWidth = 88;
  writer.page.drawRectangle({
    x: writer.dimensions[0] - PAGE_MARGIN - badgeWidth,
    y: writer.cursorY - 15,
    width: badgeWidth,
    height: 30,
    color: COLORS.paleLeaf,
    borderColor: COLORS.leaf,
    borderWidth: 0.8,
  });
  await writer.text(badgeText, writer.dimensions[0] - PAGE_MARGIN - badgeWidth + 10, writer.cursorY - 4, 13, writer.bold, COLORS.leafDark, {
    bold: true,
    maxWidth: badgeWidth - 20,
  });
  writer.cursorY -= 25;
  await writer.text(studentGradeLabel(data.gradeLevel), PAGE_MARGIN, writer.cursorY, 12, writer.bold, COLORS.earth, {
    bold: true,
    maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2 - 100,
  });
  writer.cursorY -= 23;
  await writer.text(`${data.gradingSchemeName}. This report reflects grades recorded so far.`, PAGE_MARGIN, writer.cursorY, 9.5, writer.font, COLORS.muted, {
    maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2,
  });
  writer.cursorY -= 24;

  await drawMetricCards(writer, [
    { label: "Overall average", value: data.overallAverage == null ? "-" : `${data.overallAverage}%` },
    { label: "Grades recorded", value: String(data.gradedEntries) },
    { label: "Year progress", value: `${data.completedWeeks}/${data.totalWeeks} weeks` },
    { label: "Learning days", value: String(data.learningDays) },
  ]);

  await writer.sectionHeading("Subject grades");
  if (data.subjects.length === 0) {
    await writer.text("No subject grades have been recorded for this learning year yet.", PAGE_MARGIN, writer.cursorY, 10.5, writer.font, COLORS.muted, {
      maxWidth: writer.dimensions[0] - PAGE_MARGIN * 2,
    });
  } else {
    for (const subject of data.subjects) {
      await writer.ensureSpace(66);
      const x = PAGE_MARGIN;
      const width = writer.dimensions[0] - PAGE_MARGIN * 2;
      const rowY = writer.cursorY - 56;
      writer.page.drawRectangle({
        x,
        y: rowY,
        width,
        height: 56,
        color: COLORS.white,
        borderColor: COLORS.line,
        borderWidth: 0.7,
      });
      await writer.text(subject.subjectLabel, x + 13, writer.cursorY - 22, 13, writer.bold, COLORS.ink, {
        bold: true,
        maxWidth: 230,
      });
      await writer.text(`${subject.gradedEntries} graded ${subject.gradedEntries === 1 ? "entry" : "entries"}`, x + 13, writer.cursorY - 42, 8.5, writer.font, COLORS.muted, {
        maxWidth: 230,
      });

      const average = subject.averageScore == null ? 0 : Math.max(0, Math.min(100, subject.averageScore));
      const barX = x + 270;
      const barWidth = 128;
      writer.page.drawRectangle({ x: barX, y: writer.cursorY - 36, width: barWidth, height: 9, color: COLORS.sand });
      if (subject.averageScore != null) {
        writer.page.drawRectangle({ x: barX, y: writer.cursorY - 36, width: barWidth * average / 100, height: 9, color: COLORS.leaf });
      }
      await writer.text(subject.averageScore == null ? "Not graded" : `${subject.averageScore}%`, barX, writer.cursorY - 17, 10, writer.bold, COLORS.leafDark, {
        bold: true,
        maxWidth: barWidth,
      });

      const gradeX = x + width - 68;
      writer.page.drawRectangle({
        x: gradeX,
        y: writer.cursorY - 47,
        width: 52,
        height: 38,
        color: COLORS.paleLeaf,
        borderColor: COLORS.leaf,
        borderWidth: 0.8,
      });
      await writer.text(subject.grade ?? "-", gradeX + 10, writer.cursorY - 35, 19, writer.bold, COLORS.leafDark, {
        bold: true,
        maxWidth: 32,
      });
      writer.cursorY -= 64;
    }
  }

  await writer.ensureSpace(88);
  writer.cursorY -= 6;
  writer.page.drawRectangle({
    x: PAGE_MARGIN,
    y: writer.cursorY - 58,
    width: writer.dimensions[0] - PAGE_MARGIN * 2,
    height: 58,
    color: COLORS.paleLeaf,
  });
  await writer.text("Parent or teacher notes", PAGE_MARGIN + 14, writer.cursorY - 20, 9.5, writer.bold, COLORS.leafDark, {
    bold: true,
  });
  writer.page.drawLine({
    start: { x: PAGE_MARGIN + 14, y: writer.cursorY - 43 },
    end: { x: writer.dimensions[0] - PAGE_MARGIN - 14, y: writer.cursorY - 43 },
    thickness: 0.7,
    color: COLORS.line,
  });

  return writer.finish();
}
