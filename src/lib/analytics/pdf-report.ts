import PDFDocument from "pdfkit";
import { formatDuration, formatNumber, formatPercent, formatSignedPercent, formatSignedPoints, isImprovement, pointsChange, ratioChange } from "./format";
import { formatDateLabel, hostnameFromUrl } from "./timezone";
import type { BreakdownRow, TimeseriesPoint, WeeklyReportData } from "./types";

const MARGIN = 42;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ACCENT = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const CARD_BG = "#f9fafb";
const GREEN = "#166534";
const RED = "#991b1b";
const SERIES = ["#111827", "#2563eb", "#059669"];

type PDFDoc = InstanceType<typeof PDFDocument>;
type PDFDocInternal = PDFDoc & { _wrapper?: unknown; _textOptions?: unknown };

function resetPdfTextState(doc: PDFDoc) {
  const internal = doc as PDFDocInternal;
  internal._wrapper = null;
  internal._textOptions = null;
}

function ensureSpace(doc: PDFDoc, height: number) {
  const bottom = PAGE_HEIGHT - 48;
  if (doc.y + height > bottom) {
    doc.addPage();
    doc.x = MARGIN;
    doc.y = MARGIN + 8;
  }
}

export function weeklyPdfFilename(
  site: { name: string; url: string },
  startDate: string,
  endDate: string,
): string {
  const domain = hostnameFromUrl(site.url).replace(/\./g, "_");
  return `${domain}_weekly_${startDate}_${endDate}.pdf`;
}

export async function generateWeeklyPdf(data: WeeklyReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `${data.site.name} Weekly Traffic Report`,
      Author: "Admin Panel",
    },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawHeader(doc, data);
  drawKpiGrid(doc, data);
  drawTrend(doc, data.daily);
  drawDailyTable(doc, data);
  drawCountrySection(doc, data.countries);
  drawDeviceSection(doc, data.devices);
  drawSourceSection(doc, data.sources);
  if (data.campaigns.length > 0) drawCampaignSection(doc, data.campaigns);
  drawLandingSection(doc, data.landingPages);
  drawComparison(doc, data);
  drawInsights(doc, data.insights);

  const range = doc.bufferedPageRange();
  const pageCount = range.count;
  for (let i = range.start; i < range.start + pageCount; i += 1) {
    drawChrome(doc, data, i, pageCount);
  }

  doc.end();
  return done;
}

function drawHeader(doc: PDFDoc, data: WeeklyReportData) {
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(20).text(data.site.name.toUpperCase(), MARGIN, MARGIN);
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("Weekly Traffic Analytics", MARGIN, doc.y + 2);
  doc.moveDown(0.3);
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(11).text(
    `${formatDateLabel(data.periodStart)} — ${formatDateLabel(data.periodEnd)}`,
    MARGIN,
    doc.y,
  );
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(
    `${data.site.domain} · Timezone ${data.timezone} · Generated ${formatDateLabel(data.generatedAt.slice(0, 10))}`,
    MARGIN,
    doc.y + 2,
  );
  doc.moveDown(0.8);
  doc.strokeColor(LINE).moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke();
  doc.moveDown(0.6);
}

function drawKpiGrid(doc: PDFDoc, data: WeeklyReportData) {
  ensureSpace(doc, 150);
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(12).text("Executive summary", MARGIN, doc.y);
  doc.moveDown(0.4);
  const cards: { label: string; value: string; change: string; good: boolean | null }[] = [
    kpiCard("Total Users", formatNumber(data.current.totalUsers), data.current.totalUsers, data.previous.totalUsers),
    kpiCard("New Users", formatNumber(data.current.newUsers), data.current.newUsers, data.previous.newUsers),
    kpiCard("Sessions / Visits", formatNumber(data.current.sessions), data.current.sessions, data.previous.sessions),
    kpiCard("Page Views", formatNumber(data.current.pageViews), data.current.pageViews, data.previous.pageViews),
    kpiCard("Bounce Rate", formatPercent(data.current.bounceRate), data.current.bounceRate, data.previous.bounceRate, "bounceRate"),
    kpiCard("Engagement Rate", formatPercent(data.current.engagementRate), data.current.engagementRate, data.previous.engagementRate),
    kpiCard("Avg. Session Duration", formatDuration(data.current.averageSessionDuration), data.current.averageSessionDuration, data.previous.averageSessionDuration),
    kpiCard("Views / Session", formatNumber(data.current.viewsPerSession, 2), data.current.viewsPerSession, data.previous.viewsPerSession),
  ];
  const startY = doc.y;
  const gap = 8;
  const width = (CONTENT_WIDTH - gap) / 2;
  cards.forEach((card, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + col * (width + gap);
    const y = startY + row * 52;
    doc.roundedRect(x, y, width, 46, 4).fillAndStroke(CARD_BG, LINE);
    doc.fillColor(MUTED).font("Helvetica").fontSize(7).text(card.label.toUpperCase(), x + 10, y + 8, { width: width - 20 });
    doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(13).text(card.value, x + 10, y + 20, { width: width / 2 });
    if (card.change !== "—") {
      doc.fillColor(card.good ? GREEN : RED).font("Helvetica").fontSize(8).text(card.change, x + width / 2, y + 23, {
        width: width / 2 - 12,
        align: "right",
      });
    }
  });
  doc.y = startY + Math.ceil(cards.length / 2) * 52 + 8;
}

function kpiCard(
  label: string,
  value: string,
  current: number,
  previous: number,
  kind: "bounceRate" | "default" = "default",
) {
  if (kind === "bounceRate") {
    const change = pointsChange(current, previous);
    return {
      label,
      value,
      change: previous || current ? `${formatSignedPoints(change)} vs previous week` : "—",
      good: isImprovement("bounceRate", change),
    };
  }
  const change = ratioChange(current, previous);
  return {
    label,
    value,
    change: change == null ? "—" : `${formatSignedPercent(change)} vs previous week`,
    good: change == null ? null : isImprovement("default", change),
  };
}

function drawTrend(doc: PDFDoc, daily: TimeseriesPoint[]) {
  ensureSpace(doc, 210);
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(12).text("Traffic over the week", MARGIN, doc.y);
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("Sessions, users and page views by day", MARGIN, doc.y + 2);
  doc.moveDown(0.5);
  const chartY = doc.y;
  const height = 150;
  doc.rect(MARGIN, chartY, CONTENT_WIDTH, height).strokeColor(LINE).stroke();
  if (daily.length === 0) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("No analytics data for selected period", MARGIN + 12, chartY + 68);
    doc.y = chartY + height + 12;
    return;
  }
  const max = Math.max(...daily.flatMap((point) => [point.sessions, point.activeUsers, point.pageViews]), 1);
  const innerLeft = MARGIN + 36;
  const innerTop = chartY + 12;
  const innerWidth = CONTENT_WIDTH - 48;
  const innerHeight = height - 36;
  const series = [
    { key: "sessions" as const, label: "Sessions", color: SERIES[0] },
    { key: "activeUsers" as const, label: "Users", color: SERIES[1] },
    { key: "pageViews" as const, label: "Page Views", color: SERIES[2] },
  ];
  for (const item of series) {
    doc.strokeColor(item.color).lineWidth(1.2);
    doc.moveTo(innerLeft, yAt(daily[0][item.key]));
    daily.forEach((point, index) => {
      const x = innerLeft + (daily.length === 1 ? innerWidth / 2 : (index / (daily.length - 1)) * innerWidth);
      const y = yAt(point[item.key]);
      if (index === 0) doc.moveTo(x, y);
      else doc.lineTo(x, y);
    });
    doc.stroke();
  }
  daily.forEach((point, index) => {
    const x = innerLeft + (daily.length === 1 ? innerWidth / 2 : (index / (daily.length - 1)) * innerWidth);
    doc.fillColor(MUTED).font("Helvetica").fontSize(6).text(point.label.replace(/^\d{1,2} /, "").slice(0, 6), x - 16, chartY + height - 14, {
      width: 32,
      align: "center",
    });
  });
  doc.fillColor(MUTED).font("Helvetica").fontSize(6).text(formatNumber(max), MARGIN + 4, innerTop);
  let legendX = MARGIN + 80;
  for (const item of series) {
    doc.rect(legendX, chartY + 6, 8, 8).fill(item.color);
    doc.fillColor(ACCENT).font("Helvetica").fontSize(7).text(item.label, legendX + 12, chartY + 5);
    legendX += 70;
  }
  doc.y = chartY + height + 14;

  function yAt(value: number) {
    return innerTop + innerHeight - (value / max) * innerHeight;
  }
}

function drawDailyTable(doc: PDFDoc, data: WeeklyReportData) {
  ensureSpace(doc, 80);
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(12).text("Daily breakdown", MARGIN, doc.y);
  doc.moveDown(0.4);
  const columns = [
    { key: "label", label: "Date", width: 90, align: "left" as const },
    { key: "activeUsers", label: "Users", width: 70, align: "right" as const },
    { key: "sessions", label: "Sessions", width: 80, align: "right" as const },
    { key: "pageViews", label: "Page Views", width: 80, align: "right" as const },
    { key: "bounceRate", label: "Bounce", width: 70, align: "right" as const },
    { key: "engagementRate", label: "Engagement", width: 81, align: "right" as const },
  ];
  drawTableHeader(doc, columns);
  for (const point of data.daily) {
    drawTableRow(doc, columns, [
      weekdayLabel(point.key),
      formatNumber(point.activeUsers),
      formatNumber(point.sessions),
      formatNumber(point.pageViews),
      formatPercent(point.bounceRate),
      formatPercent(point.engagementRate),
    ]);
  }
  const totals = data.current;
  drawTableRow(
    doc,
    columns,
    [
      "Week total",
      formatNumber(totals.totalUsers),
      formatNumber(totals.sessions),
      formatNumber(totals.pageViews),
      formatPercent(totals.bounceRate),
      formatPercent(totals.engagementRate),
    ],
    true,
  );
  doc.moveDown(0.6);
}

function weekdayLabel(dateYmd: string): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function drawCountrySection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Traffic by country");
  if (rows.length === 0) return emptyNote(doc);
  drawBarChart(doc, rows.slice(0, 8).map((row) => ({ label: row.label, value: row.sessions })));
  drawBreakdownTable(doc, rows, ["Country", "Users", "Sessions", "Page Views", "Bounce", "Engagement", "Share"]);
}

function drawDeviceSection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Traffic by device");
  if (rows.length === 0) return emptyNote(doc);
  drawDonut(doc, rows.map((row) => ({ label: row.label, value: row.sessions })));
  drawBreakdownTable(doc, rows, ["Device", "Users", "Sessions", "Page Views", "Bounce", "Engagement", "Share"]);
}

function drawSourceSection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Traffic sources");
  if (rows.length === 0) return emptyNote(doc);
  drawBreakdownTable(doc, rows, ["Source / Medium", "Users", "Sessions", "Page Views", "Bounce", "Engagement", "Share"]);
}

function drawCampaignSection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Campaign performance");
  drawBreakdownTable(doc, rows, ["Campaign", "Users", "Sessions", "Page Views", "Bounce", "Engagement", "Share"]);
}

function drawLandingSection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Top landing pages");
  if (rows.length === 0) return emptyNote(doc);
  const columns = [
    { label: "Landing Page", width: 180, align: "left" as const },
    { label: "Users", width: 70, align: "right" as const },
    { label: "Sessions", width: 80, align: "right" as const },
    { label: "Page Views", width: 80, align: "right" as const },
    { label: "Bounce", width: 101, align: "right" as const },
  ];
  drawTableHeader(doc, columns);
  for (const row of rows) {
    drawTableRow(doc, columns, [
      truncate(row.label, 42),
      formatNumber(row.totalUsers || row.activeUsers),
      formatNumber(row.sessions),
      formatNumber(row.pageViews),
      formatPercent(row.bounceRate),
    ]);
  }
  doc.moveDown(0.6);
}

function drawComparison(doc: PDFDoc, data: WeeklyReportData) {
  sectionTitle(doc, "Week-over-week comparison");
  const rows: [string, string, string, string, string][] = [
    compareRow("Users", data.current.totalUsers, data.previous.totalUsers, "number"),
    compareRow("New Users", data.current.newUsers, data.previous.newUsers, "number"),
    compareRow("Sessions", data.current.sessions, data.previous.sessions, "number"),
    compareRow("Page Views", data.current.pageViews, data.previous.pageViews, "number"),
    compareRow("Bounce Rate", data.current.bounceRate, data.previous.bounceRate, "rate"),
    compareRow("Engagement Rate", data.current.engagementRate, data.previous.engagementRate, "rate"),
    compareRow("Avg. Session Duration", data.current.averageSessionDuration, data.previous.averageSessionDuration, "duration"),
  ];
  const columns = [
    { label: "Metric", width: 140, align: "left" as const },
    { label: "Current week", width: 90, align: "right" as const },
    { label: "Previous week", width: 90, align: "right" as const },
    { label: "Difference", width: 90, align: "right" as const },
    { label: "Change", width: 81, align: "right" as const },
  ];
  drawTableHeader(doc, columns);
  for (const row of rows) drawTableRow(doc, columns, row);
  doc.moveDown(0.6);
}

function compareRow(
  label: string,
  current: number,
  previous: number,
  kind: "number" | "rate" | "duration",
): [string, string, string, string, string] {
  const format =
    kind === "rate" ? formatPercent : kind === "duration" ? formatDuration : (value: number) => formatNumber(value);
  if (kind === "rate") {
    const diff = current - previous;
    return [label, format(current), format(previous), formatSignedPoints(diff), formatSignedPoints(diff)];
  }
  const change = ratioChange(current, previous);
  const diff = current - previous;
  const diffLabel = kind === "duration" ? formatDuration(Math.abs(diff)) : formatNumber(diff);
  return [
    label,
    format(current),
    format(previous),
    `${diff >= 0 ? "+" : "-"}${kind === "duration" ? diffLabel : formatNumber(Math.abs(diff))}`,
    change == null ? "—" : formatSignedPercent(change),
  ];
}

function drawInsights(doc: PDFDoc, insights: string[]) {
  sectionTitle(doc, "Key insights");
  if (insights.length === 0) return emptyNote(doc, "Not enough data to generate insights.");
  for (const insight of insights) {
    ensureSpace(doc, 22);
    doc.fillColor(ACCENT).font("Helvetica").fontSize(9).text(`•  ${insight}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.25);
  }
}

function drawBreakdownTable(doc: PDFDoc, rows: BreakdownRow[], labels: string[]) {
  const columns = [
    { label: labels[0], width: 130, align: "left" as const },
    { label: labels[1], width: 55, align: "right" as const },
    { label: labels[2], width: 60, align: "right" as const },
    { label: labels[3], width: 70, align: "right" as const },
    { label: labels[4], width: 55, align: "right" as const },
    { label: labels[5], width: 70, align: "right" as const },
    { label: labels[6], width: 51, align: "right" as const },
  ];
  drawTableHeader(doc, columns);
  for (const row of rows) {
    drawTableRow(doc, columns, [
      truncate(row.label, 28),
      formatNumber(row.totalUsers || row.activeUsers),
      formatNumber(row.sessions),
      formatNumber(row.pageViews),
      formatPercent(row.bounceRate),
      formatPercent(row.engagementRate),
      formatPercent(row.sessionsShare),
    ]);
  }
  doc.moveDown(0.6);
}

function drawTableHeader(doc: PDFDoc, columns: { label: string; width: number; align: "left" | "right" }[]) {
  ensureSpace(doc, 18);
  let x = MARGIN;
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7);
  for (const column of columns) {
    doc.text(column.label.toUpperCase(), x, doc.y, { width: column.width, align: column.align });
    x += column.width;
  }
  doc.moveDown(0.35);
  doc.strokeColor(LINE).moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke();
  doc.moveDown(0.25);
}

function drawTableRow(
  doc: PDFDoc,
  columns: { width: number; align: "left" | "right" }[],
  values: string[],
  bold = false,
) {
  ensureSpace(doc, 16);
  let x = MARGIN;
  doc.fillColor(ACCENT).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8);
  const y = doc.y;
  for (let i = 0; i < columns.length; i += 1) {
    doc.text(values[i] || "", x, y, { width: columns[i].width, align: columns[i].align, lineBreak: false });
    x += columns[i].width;
  }
  doc.y = y + 14;
}

function drawBarChart(doc: PDFDoc, rows: { label: string; value: number }[]) {
  if (rows.length === 0) return;
  const height = rows.length * 16 + 8;
  ensureSpace(doc, height + 8);
  const max = Math.max(...rows.map((row) => row.value), 1);
  const barLeft = MARGIN + 90;
  const barWidth = CONTENT_WIDTH - 90;
  rows.forEach((row, index) => {
    const y = doc.y + index * 16;
    doc.fillColor(MUTED).font("Helvetica").fontSize(7).text(truncate(row.label, 16), MARGIN, y, { width: 86 });
    const width = Math.max(2, (row.value / max) * barWidth);
    doc.rect(barLeft, y, width, 10).fill("#d1d5db");
    doc.fillColor(ACCENT).font("Helvetica").fontSize(7).text(formatNumber(row.value), barLeft + width + 4, y);
  });
  doc.y += height;
}

function drawDonut(doc: PDFDoc, rows: { label: string; value: number }[]) {
  if (rows.length === 0) return;
  ensureSpace(doc, 90);
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  const cx = MARGIN + 46;
  const cy = doc.y + 40;
  const radius = 32;
  let angle = -Math.PI / 2;
  const colors = ["#111827", "#4b5563", "#9ca3af", "#d1d5db"];
  rows.forEach((row, index) => {
    const slice = (row.value / total) * Math.PI * 2;
    drawSlice(doc, cx, cy, radius, angle, angle + slice, colors[index % colors.length]);
    angle += slice;
  });
  let legendY = doc.y + 8;
  rows.forEach((row, index) => {
    doc.rect(MARGIN + 100, legendY + 2, 8, 8).fill(colors[index % colors.length]);
    doc.fillColor(ACCENT).font("Helvetica").fontSize(8).text(
      `${capitalize(row.label)}  ${formatNumber(row.value)}  (${formatPercent(row.value / total)})`,
      MARGIN + 114,
      legendY,
    );
    legendY += 14;
  });
  doc.y = Math.max(doc.y + 88, legendY + 8);
}

function drawSlice(doc: PDFDoc, cx: number, cy: number, radius: number, start: number, end: number, color: string) {
  doc.save();
  doc.fillColor(color);
  doc.moveTo(cx, cy);
  const steps = Math.max(8, Math.ceil(((end - start) / (Math.PI * 2)) * 32));
  for (let i = 0; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps;
    doc.lineTo(cx + Math.cos(t) * radius, cy + Math.sin(t) * radius);
  }
  doc.closePath();
  doc.fill();
  doc.restore();
}

function drawChrome(doc: PDFDoc, data: WeeklyReportData, pageIndex: number, pageCount: number) {
  doc.switchToPage(pageIndex);
  resetPdfTextState(doc);
  doc.fillColor(MUTED).font("Helvetica").fontSize(7);
  doc.text(`Generated by Admin Panel · ${data.site.domain}`, MARGIN, PAGE_HEIGHT - 28, {
    lineBreak: false,
  });
  const label = `Page ${pageIndex + 1} of ${pageCount}`;
  const width = doc.widthOfString(label);
  doc.text(label, PAGE_WIDTH - MARGIN - width, PAGE_HEIGHT - 28, { lineBreak: false });
}

function sectionTitle(doc: PDFDoc, title: string) {
  ensureSpace(doc, 28);
  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(12).text(title, MARGIN, doc.y);
  doc.moveDown(0.25);
  doc.strokeColor(LINE).moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke();
  doc.moveDown(0.45);
}

function emptyNote(doc: PDFDoc, text = "No analytics data for selected period") {
  doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(text, MARGIN, doc.y);
  doc.moveDown(0.8);
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
