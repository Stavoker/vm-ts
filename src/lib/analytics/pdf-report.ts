import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  formatDuration,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatSignedPointsUk,
  formatUsd,
  isImprovement,
  pointsChange,
  ratioChange,
} from "./format";
import { translateCountryLabel, translateDeviceLabel, translateSourceLabel } from "./pdf-i18n";
import { formatUkDateLabel, hostnameFromUrl } from "./timezone";
import type { BreakdownRow, TimeseriesPoint, WeeklyReportData } from "./types";

const MARGIN = 36;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY = "#0f172a";
const ACCENT = "#0071e3";
const ORANGE = "#ea580c";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const CARD_BG = "#f8fafc";
const ZEBRA = "#f1f5f9";
const GREEN = "#166534";
const RED = "#991b1b";
const WHITE = "#ffffff";
const SERIES = ["#0f172a", "#0071e3", "#059669"];
const FONT = "Report";
const FONT_BOLD = "Report-Bold";
const LOCALE = "uk-UA";
const HEADER_HEIGHT = 92;
const CONTINUATION_TOP = 50;
const TABLE_HEADER_H = 22;
const TABLE_ROW_H = 18;

type PDFDoc = InstanceType<typeof PDFDocument>;
type PDFDocInternal = PDFDoc & { _wrapper?: unknown; _textOptions?: unknown };
type Column = { label: string; width: number; align: "left" | "right" };

function n(value: number, digits = 0) {
  return formatNumber(value, digits, LOCALE);
}

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
    doc.y = CONTINUATION_TOP;
    return true;
  }
  return false;
}

function resolveFont(name: string): string {
  const candidates = [
    path.join(process.cwd(), "public", "fonts", name),
    path.join(process.cwd(), "fonts", name),
    path.join(__dirname, "../../../public/fonts", name),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Не знайдено шрифт ${name} у public/fonts`);
  return found;
}

function registerFonts(doc: PDFDoc) {
  doc.registerFont(FONT, resolveFont("NotoSans-Regular.ttf"));
  doc.registerFont(FONT_BOLD, resolveFont("NotoSans-Bold.ttf"));
}

export function weeklyPdfFilename(
  site: { name: string; url: string },
  startDate: string,
  endDate: string,
): string {
  const domain = hostnameFromUrl(site.url).replace(/\./g, "_");
  return `${domain}_tyzhnevyy_zvit_${startDate}_${endDate}.pdf`;
}

export async function generateWeeklyPdf(data: WeeklyReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: {
      Title: `${data.site.name} — тижневий звіт трафіку`,
      Author: "Vitrina Monitor",
    },
  });
  registerFonts(doc);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawHero(doc, data);
  drawKpiGrid(doc, data);
  drawTrafficCost(doc, data);
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

function drawHero(doc: PDFDoc, data: WeeklyReportData) {
  doc.save();
  doc.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT).fill(NAVY);
  doc.rect(0, HEADER_HEIGHT - 4, PAGE_WIDTH, 4).fill(ACCENT);
  doc.restore();
  doc.fillColor("#93c5fd").font(FONT).fontSize(8).text("VITRINA MONITOR  ·  ТИЖНЕВИЙ ЗВІТ", MARGIN, 18, {
    width: CONTENT_WIDTH,
  });
  doc.fillColor(WHITE).font(FONT_BOLD).fontSize(20).text(data.site.name, MARGIN, 34, {
    width: CONTENT_WIDTH,
  });
  doc.fillColor("#cbd5e1").font(FONT).fontSize(9).text(
    `${formatUkDateLabel(data.periodStart)} — ${formatUkDateLabel(data.periodEnd)}  ·  ${data.site.domain}  ·  ${data.timezone}`,
    MARGIN,
    62,
    { width: CONTENT_WIDTH },
  );
  doc.y = HEADER_HEIGHT + 16;
  doc.x = MARGIN;
}

function drawKpiGrid(doc: PDFDoc, data: WeeklyReportData) {
  sectionTitle(doc, "Короткий підсумок");
  const cards: { label: string; value: string; change: string; good: boolean | null }[] = [
    kpiCard("Користувачі", n(data.current.totalUsers), data.current.totalUsers, data.previous.totalUsers),
    kpiCard("Нові користувачі", n(data.current.newUsers), data.current.newUsers, data.previous.newUsers),
    kpiCard("Сесії / візити", n(data.current.sessions), data.current.sessions, data.previous.sessions),
    kpiCard("Перегляди сторінок", n(data.current.pageViews), data.current.pageViews, data.previous.pageViews),
    kpiCard("Показник відмов", formatPercent(data.current.bounceRate), data.current.bounceRate, data.previous.bounceRate, "bounceRate"),
    kpiCard("Рівень залучення", formatPercent(data.current.engagementRate), data.current.engagementRate, data.previous.engagementRate),
    kpiCard("Середня тривалість сесії", formatDuration(data.current.averageSessionDuration), data.current.averageSessionDuration, data.previous.averageSessionDuration),
    kpiCard("Перегляди / сесія", n(data.current.viewsPerSession, 2), data.current.viewsPerSession, data.previous.viewsPerSession),
  ];
  ensureSpace(doc, 220);
  const startY = doc.y;
  const gap = 8;
  const width = (CONTENT_WIDTH - gap) / 2;
  cards.forEach((card, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + col * (width + gap);
    const y = startY + row * 54;
    doc.roundedRect(x, y, width, 48, 6).fillAndStroke(CARD_BG, LINE);
    doc.rect(x, y, 3, 48).fill(ACCENT);
    doc.fillColor(MUTED).font(FONT).fontSize(7).text(card.label.toUpperCase(), x + 12, y + 8, { width: width - 20 });
    doc.fillColor(NAVY).font(FONT_BOLD).fontSize(13).text(card.value, x + 12, y + 22, { width: width / 2 });
    if (card.change !== "—") {
      doc.fillColor(card.good ? GREEN : RED).font(FONT).fontSize(8).text(card.change, x + width / 2, y + 24, {
        width: width / 2 - 12,
        align: "right",
      });
    }
  });
  doc.y = startY + Math.ceil(cards.length / 2) * 54 + 10;
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
      change: previous || current ? `${formatSignedPointsUk(change)} до минулого тижня` : "—",
      good: isImprovement("bounceRate", change),
    };
  }
  const change = ratioChange(current, previous);
  return {
    label,
    value,
    change: change == null ? "—" : `${formatSignedPercent(change)} до минулого тижня`,
    good: change == null ? null : isImprovement("default", change),
  };
}

function drawTrafficCost(doc: PDFDoc, data: WeeklyReportData) {
  const cost = data.trafficCost;
  sectionTitle(doc, "Вартість трафіку Traffic Creator");
  doc.fillColor(MUTED).font(FONT).fontSize(8).text(
    `Тарифи Professional на ${cost.sourceUrl}  ·  вартість 1 000 візитів рахується за стартовим пакетом 60 тис.`,
    MARGIN,
    doc.y,
    { width: CONTENT_WIDTH },
  );
  doc.moveDown(0.45);
  ensureSpace(doc, 70);
  const cards = [
    { label: "1 000 візитів · Professional", value: formatUsd(cost.professionalCpmUsd), accent: ORANGE },
    { label: "1 000 візитів · Expert", value: formatUsd(cost.expertCpmUsd), accent: NAVY },
    { label: "Сесії за тиждень", value: formatUsd(cost.sessionsCostUsd), accent: ACCENT },
    { label: "Користувачі за тиждень", value: formatUsd(cost.usersCostUsd), accent: ACCENT },
  ];
  const gap = 8;
  const width = (CONTENT_WIDTH - gap * 3) / 4;
  const y = doc.y;
  cards.forEach((card, index) => {
    const x = MARGIN + index * (width + gap);
    doc.roundedRect(x, y, width, 62, 6).fillAndStroke(WHITE, LINE);
    doc.rect(x, y, width, 3).fill(card.accent);
    doc.fillColor(MUTED).font(FONT).fontSize(6.5).text(card.label.toUpperCase(), x + 8, y + 10, {
      width: width - 16,
    });
    doc.fillColor(NAVY).font(FONT_BOLD).fontSize(13).text(card.value, x + 8, y + 34, { width: width - 16 });
  });
  doc.y = y + 74;

  const columns: Column[] = [
    { label: "Пакет", width: 90, align: "left" },
    { label: "Візити", width: 90, align: "right" },
    { label: "Ціна пакета", width: 100, align: "right" },
    { label: "Ціна за 1 000", width: 100, align: "right" },
    { label: "Якість", width: 131, align: "right" },
  ];
  drawStyledTable(
    doc,
    columns,
    cost.packs.map((pack) => [
      pack.label,
      n(pack.visits),
      formatUsd(pack.priceUsd),
      formatUsd(pack.cpmUsd),
      "Professional",
    ]),
  );
  const sessionsChange = ratioChange(cost.sessionsCostUsd, cost.previousSessionsCostUsd);
  doc.fillColor(MUTED).font(FONT).fontSize(8).text(
    `Орієнтовна вартість тижневих сесій: ${formatUsd(cost.sessionsCostUsd)}` +
      (sessionsChange == null ? "." : ` (${formatSignedPercent(sessionsChange)} до минулого тижня).`) +
      " Expert дорожчий приблизно на 40%.",
    MARGIN,
    doc.y,
    { width: CONTENT_WIDTH },
  );
  doc.moveDown(0.8);
}

function drawTrend(doc: PDFDoc, daily: TimeseriesPoint[]) {
  ensureSpace(doc, 210);
  doc.fillColor(NAVY).font(FONT_BOLD).fontSize(12).text("Трафік протягом тижня", MARGIN, doc.y);
  doc.fillColor(MUTED).font(FONT).fontSize(8).text("Сесії, користувачі та перегляди сторінок за днями", MARGIN, doc.y + 2);
  doc.moveDown(0.5);
  const chartY = doc.y;
  const height = 150;
  doc.roundedRect(MARGIN, chartY, CONTENT_WIDTH, height, 6).fillAndStroke(CARD_BG, LINE);
  if (daily.length === 0) {
    doc.fillColor(MUTED).font(FONT).fontSize(9).text("Немає даних аналітики за вибраний період", MARGIN + 12, chartY + 68);
    doc.y = chartY + height + 12;
    return;
  }
  const max = Math.max(...daily.flatMap((point) => [point.sessions, point.activeUsers, point.pageViews]), 1);
  const innerLeft = MARGIN + 36;
  const innerTop = chartY + 18;
  const innerWidth = CONTENT_WIDTH - 48;
  const innerHeight = height - 42;
  const series = [
    { key: "sessions" as const, label: "Сесії", color: SERIES[0] },
    { key: "activeUsers" as const, label: "Користувачі", color: SERIES[1] },
    { key: "pageViews" as const, label: "Перегляди", color: SERIES[2] },
  ];
  for (const item of series) {
    doc.strokeColor(item.color).lineWidth(1.4);
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
    doc.fillColor(MUTED).font(FONT).fontSize(6).text(shortWeekday(point.key), x - 16, chartY + height - 14, {
      width: 32,
      align: "center",
    });
  });
  doc.fillColor(MUTED).font(FONT).fontSize(6).text(n(max), MARGIN + 4, innerTop);
  let legendX = MARGIN + 80;
  for (const item of series) {
    doc.roundedRect(legendX, chartY + 8, 8, 8, 2).fill(item.color);
    doc.fillColor(NAVY).font(FONT).fontSize(7).text(item.label, legendX + 12, chartY + 7);
    legendX += 80;
  }
  doc.y = chartY + height + 14;

  function yAt(value: number) {
    return innerTop + innerHeight - (value / max) * innerHeight;
  }
}

function drawDailyTable(doc: PDFDoc, data: WeeklyReportData) {
  sectionTitle(doc, "Щоденна розбивка");
  const columns: Column[] = [
    { label: "Дата", width: 120, align: "left" },
    { label: "Користувачі", width: 70, align: "right" },
    { label: "Сесії", width: 70, align: "right" },
    { label: "Перегляди", width: 80, align: "right" },
    { label: "Відмови", width: 70, align: "right" },
    { label: "Залучення", width: 111, align: "right" },
  ];
  const rows = data.daily.map((point) => [
    weekdayLabel(point.key),
    n(point.activeUsers),
    n(point.sessions),
    n(point.pageViews),
    formatPercent(point.bounceRate),
    formatPercent(point.engagementRate),
  ]);
  const totals = data.current;
  rows.push([
    "Разом за тиждень",
    n(totals.totalUsers),
    n(totals.sessions),
    n(totals.pageViews),
    formatPercent(totals.bounceRate),
    formatPercent(totals.engagementRate),
  ]);
  drawStyledTable(doc, columns, rows, { footer: true });
}

function weekdayLabel(dateYmd: string): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  return new Intl.DateTimeFormat("uk-UA", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function shortWeekday(dateYmd: string): string {
  const [year, month, day] = dateYmd.split("-").map(Number);
  return new Intl.DateTimeFormat("uk-UA", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function drawCountrySection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Трафік за країнами");
  if (rows.length === 0) return emptyNote(doc);
  drawBarChart(doc, rows.slice(0, 8).map((row) => ({ label: translateCountryLabel(row.label), value: row.sessions })));
  drawBreakdownTable(doc, rows, ["Країна", "Користувачі", "Сесії", "Перегляди", "Відмови", "Залучення", "Частка"], translateCountryLabel);
}

function drawDeviceSection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Трафік за пристроями");
  if (rows.length === 0) return emptyNote(doc);
  drawDonut(doc, rows.map((row) => ({ label: translateDeviceLabel(row.label), value: row.sessions })));
  drawBreakdownTable(doc, rows, ["Пристрій", "Користувачі", "Сесії", "Перегляди", "Відмови", "Залучення", "Частка"], translateDeviceLabel);
}

function drawSourceSection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Джерела трафіку");
  if (rows.length === 0) return emptyNote(doc);
  drawBreakdownTable(doc, rows, ["Джерело / канал", "Користувачі", "Сесії", "Перегляди", "Відмови", "Залучення", "Частка"], translateSourceLabel);
}

function drawCampaignSection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Ефективність кампаній");
  drawBreakdownTable(doc, rows, ["Кампанія", "Користувачі", "Сесії", "Перегляди", "Відмови", "Залучення", "Частка"]);
}

function drawLandingSection(doc: PDFDoc, rows: BreakdownRow[]) {
  sectionTitle(doc, "Топ посадкових сторінок");
  if (rows.length === 0) return emptyNote(doc);
  const columns: Column[] = [
    { label: "Посадкова сторінка", width: 200, align: "left" },
    { label: "Користувачі", width: 80, align: "right" },
    { label: "Сесії", width: 80, align: "right" },
    { label: "Перегляди", width: 80, align: "right" },
    { label: "Відмови", width: 81, align: "right" },
  ];
  drawStyledTable(
    doc,
    columns,
    rows.map((row) => [
      truncate(row.label, 46),
      n(row.totalUsers || row.activeUsers),
      n(row.sessions),
      n(row.pageViews),
      formatPercent(row.bounceRate),
    ]),
  );
}

function drawComparison(doc: PDFDoc, data: WeeklyReportData) {
  sectionTitle(doc, "Порівняння з минулим тижнем");
  const columns: Column[] = [
    { label: "Показник", width: 150, align: "left" },
    { label: "Поточний тиждень", width: 90, align: "right" },
    { label: "Минулий тиждень", width: 90, align: "right" },
    { label: "Різниця", width: 90, align: "right" },
    { label: "Зміна", width: 101, align: "right" },
  ];
  drawStyledTable(doc, columns, [
    compareRow("Користувачі", data.current.totalUsers, data.previous.totalUsers, "number"),
    compareRow("Нові користувачі", data.current.newUsers, data.previous.newUsers, "number"),
    compareRow("Сесії", data.current.sessions, data.previous.sessions, "number"),
    compareRow("Перегляди сторінок", data.current.pageViews, data.previous.pageViews, "number"),
    compareRow("Показник відмов", data.current.bounceRate, data.previous.bounceRate, "rate"),
    compareRow("Рівень залучення", data.current.engagementRate, data.previous.engagementRate, "rate"),
    compareRow("Середня тривалість сесії", data.current.averageSessionDuration, data.previous.averageSessionDuration, "duration"),
    compareRow("Вартість сесій, USD", data.trafficCost.sessionsCostUsd, data.trafficCost.previousSessionsCostUsd, "money"),
  ]);
}

function compareRow(
  label: string,
  current: number,
  previous: number,
  kind: "number" | "rate" | "duration" | "money",
): string[] {
  const format =
    kind === "rate"
      ? formatPercent
      : kind === "duration"
        ? formatDuration
        : kind === "money"
          ? formatUsd
          : (value: number) => n(value);
  if (kind === "rate") {
    const diff = current - previous;
    return [label, format(current), format(previous), formatSignedPointsUk(diff), formatSignedPointsUk(diff)];
  }
  const change = ratioChange(current, previous);
  const diff = current - previous;
  const absLabel = kind === "duration" ? formatDuration(Math.abs(diff)) : kind === "money" ? formatUsd(Math.abs(diff)) : n(Math.abs(diff));
  return [
    label,
    format(current),
    format(previous),
    `${diff >= 0 ? "+" : "−"}${absLabel}`,
    change == null ? "—" : formatSignedPercent(change),
  ];
}

function drawInsights(doc: PDFDoc, insights: string[]) {
  sectionTitle(doc, "Ключові висновки");
  if (insights.length === 0) return emptyNote(doc, "Недостатньо даних для висновків.");
  for (const insight of insights) {
    ensureSpace(doc, 28);
    const y = doc.y;
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 24, 4).fill(CARD_BG);
    doc.circle(MARGIN + 10, y + 12, 2.5).fill(ACCENT);
    doc.fillColor(NAVY).font(FONT).fontSize(8.5).text(insight, MARGIN + 20, y + 7, { width: CONTENT_WIDTH - 28 });
    doc.y = y + 28;
  }
}

function drawBreakdownTable(
  doc: PDFDoc,
  rows: BreakdownRow[],
  labels: string[],
  translate: (value: string) => string = (value) => value,
) {
  const columns: Column[] = [
    { label: labels[0], width: 130, align: "left" },
    { label: labels[1], width: 62, align: "right" },
    { label: labels[2], width: 62, align: "right" },
    { label: labels[3], width: 70, align: "right" },
    { label: labels[4], width: 58, align: "right" },
    { label: labels[5], width: 70, align: "right" },
    { label: labels[6], width: 69, align: "right" },
  ];
  drawStyledTable(
    doc,
    columns,
    rows.map((row) => [
      truncate(translate(row.label), 28),
      n(row.totalUsers || row.activeUsers),
      n(row.sessions),
      n(row.pageViews),
      formatPercent(row.bounceRate),
      formatPercent(row.engagementRate),
      formatPercent(row.sessionsShare),
    ]),
  );
}

function drawStyledTable(doc: PDFDoc, columns: Column[], rows: string[][], options?: { footer?: boolean }) {
  const padded = padColumns(columns);
  const drawHeader = () => {
    ensureSpace(doc, TABLE_HEADER_H + TABLE_ROW_H);
    resetPdfTextState(doc);
    const y = doc.y;
    doc.save();
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, TABLE_HEADER_H, 4).fill(NAVY);
    doc.rect(MARGIN, y + 4, CONTENT_WIDTH, TABLE_HEADER_H - 4).fill(NAVY);
    doc.restore();
    let x = MARGIN;
    for (const column of padded) {
      doc.fillColor(WHITE).font(FONT_BOLD).fontSize(7).text(column.label.toUpperCase(), x + 6, y + 7, {
        width: column.width - 12,
        align: column.align,
        lineBreak: false,
      });
      x += column.width;
    }
    resetPdfTextState(doc);
    doc.x = MARGIN;
    doc.y = y + TABLE_HEADER_H;
  };

  drawHeader();
  rows.forEach((values, index) => {
    const isFooter = Boolean(options?.footer && index === rows.length - 1);
    if (ensureSpace(doc, TABLE_ROW_H)) drawHeader();
    resetPdfTextState(doc);
    const y = doc.y;
    const bg = isFooter ? "#e0f2fe" : index % 2 === 0 ? WHITE : ZEBRA;
    doc.save();
    doc.rect(MARGIN, y, CONTENT_WIDTH, TABLE_ROW_H).fill(bg);
    doc.strokeColor(LINE).lineWidth(0.4).moveTo(MARGIN, y + TABLE_ROW_H).lineTo(MARGIN + CONTENT_WIDTH, y + TABLE_ROW_H).stroke();
    doc.restore();
    let x = MARGIN;
    for (let i = 0; i < padded.length; i += 1) {
      doc.fillColor(NAVY).font(isFooter ? FONT_BOLD : FONT).fontSize(8).text(values[i] || "", x + 6, y + 4.5, {
        width: padded[i].width - 12,
        align: padded[i].align,
        lineBreak: false,
      });
      x += padded[i].width;
    }
    resetPdfTextState(doc);
    doc.x = MARGIN;
    doc.y = y + TABLE_ROW_H;
  });
  doc.x = MARGIN;
  doc.moveDown(0.7);
}

function padColumns(columns: Column[]): Column[] {
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  if (total >= CONTENT_WIDTH) return columns;
  const last = columns[columns.length - 1];
  return [...columns.slice(0, -1), { ...last, width: last.width + (CONTENT_WIDTH - total) }];
}

function drawBarChart(doc: PDFDoc, rows: { label: string; value: number }[]) {
  if (rows.length === 0) return;
  const height = rows.length * 18 + 8;
  ensureSpace(doc, height + 8);
  const max = Math.max(...rows.map((row) => row.value), 1);
  const barLeft = MARGIN + 110;
  const barWidth = CONTENT_WIDTH - 150;
  rows.forEach((row, index) => {
    const y = doc.y + index * 18;
    doc.fillColor(MUTED).font(FONT).fontSize(7).text(truncate(row.label, 20), MARGIN, y + 1, { width: 104 });
    const width = Math.max(4, (row.value / max) * barWidth);
    doc.roundedRect(barLeft, y, width, 11, 2).fill("#bfdbfe");
    doc.fillColor(NAVY).font(FONT).fontSize(7).text(n(row.value), barLeft + width + 6, y + 1);
  });
  doc.y += height;
}

function drawDonut(doc: PDFDoc, rows: { label: string; value: number }[]) {
  if (rows.length === 0) return;
  ensureSpace(doc, 96);
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  const cx = MARGIN + 46;
  const cy = doc.y + 42;
  const radius = 32;
  let angle = -Math.PI / 2;
  const colors = [ACCENT, NAVY, "#38bdf8", "#94a3b8"];
  rows.forEach((row, index) => {
    const slice = (row.value / total) * Math.PI * 2;
    drawSlice(doc, cx, cy, radius, angle, angle + slice, colors[index % colors.length]);
    angle += slice;
  });
  let legendY = doc.y + 10;
  rows.forEach((row, index) => {
    doc.roundedRect(MARGIN + 100, legendY + 2, 8, 8, 2).fill(colors[index % colors.length]);
    doc.fillColor(NAVY).font(FONT).fontSize(8).text(
      `${row.label}  ${n(row.value)}  (${formatPercent(row.value / total)})`,
      MARGIN + 114,
      legendY,
    );
    legendY += 14;
  });
  doc.y = Math.max(doc.y + 92, legendY + 8);
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
  if (pageIndex > 0) {
    doc.save();
    doc.rect(0, 0, PAGE_WIDTH, 32).fill(NAVY);
    doc.rect(0, 32, PAGE_WIDTH, 3).fill(ACCENT);
    doc.restore();
    doc.fillColor(WHITE).font(FONT).fontSize(8).text(`${data.site.name}  ·  тижневий звіт`, MARGIN, 12, {
      lineBreak: false,
    });
  }
  doc.fillColor(MUTED).font(FONT).fontSize(7);
  doc.text(`Згенеровано в адмін-панелі  ·  ${data.site.domain}  ·  ${formatUkDateLabel(data.generatedAt.slice(0, 10))}`, MARGIN, PAGE_HEIGHT - 28, {
    lineBreak: false,
  });
  const label = `Сторінка ${pageIndex + 1} з ${pageCount}`;
  const width = doc.widthOfString(label);
  doc.text(label, PAGE_WIDTH - MARGIN - width, PAGE_HEIGHT - 28, { lineBreak: false });
}

function sectionTitle(doc: PDFDoc, title: string) {
  ensureSpace(doc, 32);
  resetPdfTextState(doc);
  const y = doc.y;
  doc.fillColor(NAVY).font(FONT_BOLD).fontSize(12).text(title, MARGIN, y, { lineBreak: false });
  resetPdfTextState(doc);
  doc.save();
  doc.strokeColor(ACCENT).lineWidth(2).moveTo(MARGIN, y + 18).lineTo(MARGIN + 36, y + 18).stroke();
  doc.strokeColor(LINE).lineWidth(1).moveTo(MARGIN + 40, y + 18).lineTo(MARGIN + CONTENT_WIDTH, y + 18).stroke();
  doc.restore();
  doc.x = MARGIN;
  doc.y = y + 26;
}

function emptyNote(doc: PDFDoc, text = "Немає даних аналітики за вибраний період") {
  doc.fillColor(MUTED).font(FONT).fontSize(9).text(text, MARGIN, doc.y);
  doc.moveDown(0.8);
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
