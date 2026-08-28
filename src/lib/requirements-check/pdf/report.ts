import PDFDocument from "pdfkit";
import type { RequirementCheckSession, RequirementResultRow, RequirementResultStatus } from "../types";
import { REQUIREMENTS_SOURCE } from "../constants";
import {
  buildCompactComment,
  groupResultsByCategory,
  PDF_STATUS_COLORS,
  sortResultsForReport,
  summarizeBySubCategory,
} from "./report-helpers";

const MARGIN = 40;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BADGE_WIDTH = 48;
const ROW_TEXT_X = MARGIN + BADGE_WIDTH + 8;
const ROW_TEXT_WIDTH = CONTENT_WIDTH - BADGE_WIDTH - 8;

type PDFDoc = InstanceType<typeof PDFDocument>;

type PDFDocInternal = PDFDoc & {
  _wrapper?: unknown;
  _textOptions?: unknown;
};

function resetPdfTextState(doc: PDFDoc) {
  const internal = doc as PDFDocInternal;
  internal._wrapper = null;
  internal._textOptions = null;
}

function ensureSpace(doc: PDFDoc, height: number) {
  const bottom = doc.page.height - MARGIN;
  if (doc.y + height > bottom) {
    doc.addPage();
    doc.x = MARGIN;
    doc.y = MARGIN;
  }
}

function drawFooter(doc: PDFDoc, pageIndex: number, pageCount: number) {
  doc.switchToPage(pageIndex);
  resetPdfTextState(doc);
  const label = `Page ${pageIndex + 1} of ${pageCount}`;
  doc.fillColor("#9ca3af").font("Helvetica").fontSize(7);
  const labelWidth = doc.widthOfString(label);
  doc.text(label, doc.page.width - MARGIN - labelWidth, doc.page.height - 28, {
    lineBreak: false,
  });
}

function drawSectionTitle(doc: PDFDoc, title: string, color = "#111827") {
  ensureSpace(doc, 22);
  doc.fillColor(color).font("Helvetica-Bold").fontSize(11).text(title, MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.25);
  doc.strokeColor("#e5e7eb").moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke();
  doc.moveDown(0.45);
}

function drawMetricBox(
  doc: PDFDoc,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  accent: string,
) {
  doc.roundedRect(x, y, width, 44, 5).fillAndStroke("#f9fafb", "#e5e7eb");
  doc.fillColor("#6b7280").font("Helvetica").fontSize(7).text(label.toUpperCase(), x + 8, y + 8, {
    width: width - 16,
  });
  doc.fillColor(accent).font("Helvetica-Bold").fontSize(14).text(value, x + 8, y + 20, {
    width: width - 16,
  });
}

function drawStatusBadge(doc: PDFDoc, status: RequirementResultStatus, x: number, y: number) {
  const palette = PDF_STATUS_COLORS[status];
  doc.roundedRect(x, y, BADGE_WIDTH, 14, 3).fill(palette.fill);
  doc.fillColor(palette.text).font("Helvetica-Bold").fontSize(7).text(palette.label, x + 6, y + 3.5);
}

function estimateRowHeight(doc: PDFDoc, row: RequirementResultRow): number {
  const nameHeight = doc.heightOfString(row.requirement_name, {
    width: ROW_TEXT_WIDTH,
  });
  const comment = buildCompactComment(row);
  const commentHeight = comment
    ? doc.heightOfString(comment, { width: ROW_TEXT_WIDTH, lineGap: 0.5 }) + 2
    : 0;
  return Math.max(14, nameHeight) + commentHeight + 6;
}

function drawCompactRow(doc: PDFDoc, row: RequirementResultRow) {
  const rowHeight = estimateRowHeight(doc, row);
  ensureSpace(doc, rowHeight);

  const startY = doc.y;
  drawStatusBadge(doc, row.status, MARGIN, startY);

  doc
    .fillColor(row.status === "PASS" ? "#374151" : "#111827")
    .font(row.status === "PASS" ? "Helvetica" : "Helvetica-Bold")
    .fontSize(8)
    .text(row.requirement_name, ROW_TEXT_X, startY, { width: ROW_TEXT_WIDTH });

  const comment = buildCompactComment(row);
  if (comment) {
    doc
      .fillColor("#6b7280")
      .font("Helvetica")
      .fontSize(7)
      .text(comment, ROW_TEXT_X, doc.y + 1, { width: ROW_TEXT_WIDTH, lineGap: 0.5 });
  }

  doc.y = Math.max(doc.y, startY + 14) + 4;
}

function drawCategorySummaryTable(doc: PDFDoc, results: RequirementResultRow[]) {
  const summaries = summarizeBySubCategory(results);
  const colWidths = [CONTENT_WIDTH * 0.46, 42, 42, 42, 42];
  const headerY = doc.y;

  ensureSpace(doc, 20 + summaries.length * 14);
  doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(7);
  let x = MARGIN;
  for (const [label, width] of [
    ["Section", colWidths[0]],
    ["Pass", colWidths[1]],
    ["Manual", colWidths[2]],
    ["Fail", colWidths[3]],
    ["Score", colWidths[4]],
  ] as const) {
    doc.text(label, x, headerY, { width, align: label === "Section" ? "left" : "center" });
    x += width;
  }

  doc.moveDown(0.5);
  doc.strokeColor("#e5e7eb").moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke();
  doc.moveDown(0.25);

  for (const summary of summaries) {
    ensureSpace(doc, 13);
    const rowY = doc.y;
    x = MARGIN;
    doc.fillColor("#374151").font("Helvetica").fontSize(7.5);
    doc.text(`${summary.subCategory}`, x, rowY, { width: colWidths[0] - 4 });
    x += colWidths[0];
    doc.text(String(summary.pass), x, rowY, { width: colWidths[1], align: "center" });
    x += colWidths[1];
    doc.text(String(summary.manual), x, rowY, { width: colWidths[2], align: "center" });
    x += colWidths[2];
    doc.fillColor(summary.fail > 0 ? "#991b1b" : "#374151").text(String(summary.fail), x, rowY, {
      width: colWidths[3],
      align: "center",
    });
    x += colWidths[3];
    doc.fillColor("#374151").text(`${summary.score}%`, x, rowY, { width: colWidths[4], align: "center" });
    doc.y = rowY + 12;
  }

  doc.moveDown(0.5);
}

export async function generateRequirementsPdf(input: {
  session: RequirementCheckSession;
  results: RequirementResultRow[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ margin: MARGIN, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const fails = input.results.filter((row) => row.status === "FAIL");
  const manuals = input.results.filter((row) => row.status === "MANUAL");
  const passes = input.results.filter((row) => row.status === "PASS");

  doc.rect(0, 0, doc.page.width, 78).fill("#111827");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18).text("Requirements Check Report", MARGIN, 22);
  doc.font("Helvetica").fontSize(9).text(`${input.session.hostname} · ${input.session.website_url}`, MARGIN, 46, {
    width: CONTENT_WIDTH,
  });

  doc.y = 92;
  doc.fillColor("#111827");

  const boxWidth = (CONTENT_WIDTH - 15) / 4;
  const metricsY = doc.y;
  drawMetricBox(doc, MARGIN, metricsY, boxWidth, "Overall Score", `${input.session.overall_score ?? 0}%`, "#111827");
  drawMetricBox(
    doc,
    MARGIN + boxWidth + 5,
    metricsY,
    boxWidth,
    "Automation",
    `${input.session.automation_coverage ?? 0}%`,
    "#111827",
  );
  drawMetricBox(
    doc,
    MARGIN + (boxWidth + 5) * 2,
    metricsY,
    boxWidth,
    "Pages Checked",
    `${input.session.checked_pages}/${input.session.discovered_pages}`,
    "#111827",
  );
  drawMetricBox(
    doc,
    MARGIN + (boxWidth + 5) * 3,
    metricsY,
    boxWidth,
    "Pass / Manual / Fail",
    `${passes.length} / ${manuals.length} / ${fails.length}`,
    fails.length > 0 ? "#991b1b" : "#166534",
  );

  doc.y = metricsY + 56;
  doc
    .fillColor("#6b7280")
    .font("Helvetica")
    .fontSize(8)
    .text(
      `Scan date: ${new Date(input.session.completed_at || input.session.created_at).toLocaleString()} · Source: ${REQUIREMENTS_SOURCE}`,
      MARGIN,
      doc.y,
      { width: CONTENT_WIDTH },
    );
  doc.moveDown(0.8);

  drawSectionTitle(doc, "Section Summary");
  drawCategorySummaryTable(doc, input.results);

  if (fails.length > 0) {
    drawSectionTitle(doc, `Critical Issues (${fails.length})`, "#991b1b");
    for (const row of sortResultsForReport(fails)) {
      drawCompactRow(doc, row);
    }
    doc.moveDown(0.3);
  }

  drawSectionTitle(doc, "Full Checklist");
  doc
    .fillColor("#6b7280")
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      `${input.results.length} requirements · compact view (issues only show comments; passed items show name only)`,
      MARGIN,
      doc.y,
      { width: CONTENT_WIDTH },
    );
  doc.moveDown(0.5);

  for (const [key, rows] of groupResultsByCategory(input.results)) {
    const [, subCategory] = key.split("::");
    const passCount = rows.filter((row) => row.status === "PASS").length;
    const sectionScore = rows.length ? Math.round((passCount / rows.length) * 100) : 0;

    ensureSpace(doc, 24);
    const headerY = doc.y;
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9).text(subCategory, MARGIN, headerY);
    doc
      .fillColor("#9ca3af")
      .font("Helvetica")
      .fontSize(7)
      .text(`${rows.length} items · ${sectionScore}% pass`, MARGIN + CONTENT_WIDTH - 80, headerY, {
        width: 80,
        align: "right",
        lineBreak: false,
      });
    doc.y = headerY + 14;
    doc.moveDown(0.35);

    for (const row of rows) {
      drawCompactRow(doc, row);
    }
    doc.moveDown(0.2);
  }

  const range = doc.bufferedPageRange();
  const pageCount = range.count;
  for (let i = range.start; i < range.start + pageCount; i += 1) {
    drawFooter(doc, i, pageCount);
  }

  const afterFooters = doc.bufferedPageRange();
  if (afterFooters.count !== pageCount) {
    throw new Error(`PDF footer pass added ${afterFooters.count - pageCount} blank page(s)`);
  }

  doc.end();
  return done;
}

export function pdfFilename(session: RequirementCheckSession): string {
  const date = (session.completed_at || session.created_at).slice(0, 10);
  return `${session.hostname}_Requirements_Check_${date}.pdf`;
}
