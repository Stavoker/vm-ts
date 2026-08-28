import PDFDocument from "pdfkit";
import type { RequirementCheckSession, RequirementResultRow, RequirementResultStatus } from "../types";
import { REQUIREMENTS_SOURCE } from "../constants";
import {
  buildIssueComment,
  groupResultsByCategory,
  PDF_STATUS_COLORS,
  sortResultsForReport,
} from "./report-helpers";

const MARGIN = 48;
const CONTENT_WIDTH = 595.28 - MARGIN * 2;

type PDFDoc = InstanceType<typeof PDFDocument>;

function ensureSpace(doc: PDFDoc, height: number) {
  if (doc.y + height > doc.page.height - MARGIN) {
    doc.addPage();
  }
}

function drawSectionTitle(doc: PDFDoc, title: string, color = "#111827") {
  ensureSpace(doc, 28);
  doc.fillColor(color).font("Helvetica-Bold").fontSize(13).text(title, MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.4);
  doc
    .strokeColor("#e5e7eb")
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
    .stroke();
  doc.moveDown(0.6);
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
  doc.roundedRect(x, y, width, 52, 6).fillAndStroke("#f9fafb", "#e5e7eb");
  doc.fillColor("#6b7280").font("Helvetica").fontSize(8).text(label.toUpperCase(), x + 10, y + 10, {
    width: width - 20,
  });
  doc.fillColor(accent).font("Helvetica-Bold").fontSize(16).text(value, x + 10, y + 24, {
    width: width - 20,
  });
}

function drawStatusBadge(doc: PDFDoc, status: RequirementResultStatus, x: number, y: number) {
  const palette = PDF_STATUS_COLORS[status];
  const width = 52;
  doc.roundedRect(x, y, width, 16, 4).fill(palette.fill);
  doc.fillColor(palette.text).font("Helvetica-Bold").fontSize(8).text(palette.label, x + 8, y + 4);
}

function drawIssueCard(doc: PDFDoc, row: RequirementResultRow) {
  const palette = PDF_STATUS_COLORS[row.status];
  const startY = doc.y;
  const cardHeight = 78;

  ensureSpace(doc, cardHeight + 8);
  doc.roundedRect(MARGIN, startY, CONTENT_WIDTH, cardHeight, 8).fillAndStroke(palette.fill, "#e5e7eb");

  drawStatusBadge(doc, row.status, MARGIN + 12, startY + 10);
  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(row.requirement_name, MARGIN + 72, startY + 10, { width: CONTENT_WIDTH - 84 });

  doc
    .fillColor("#374151")
    .font("Helvetica")
    .fontSize(9)
    .text(buildIssueComment(row), MARGIN + 12, startY + 32, {
      width: CONTENT_WIDTH - 24,
      lineGap: 2,
    });

  doc.y = startY + cardHeight + 10;
}

export async function generateRequirementsPdf(input: {
  session: RequirementCheckSession;
  results: RequirementResultRow[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const fails = input.results.filter((row) => row.status === "FAIL");
  const manuals = input.results.filter((row) => row.status === "MANUAL");
  const passes = input.results.filter((row) => row.status === "PASS");

  doc.rect(0, 0, doc.page.width, 92).fill("#111827");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("Requirements Check Report", MARGIN, 28);
  doc
    .font("Helvetica")
    .fontSize(10)
    .text(`${input.session.hostname} · ${input.session.website_url}`, MARGIN, 56, {
      width: CONTENT_WIDTH,
    });

  doc.y = 110;
  doc.fillColor("#111827");

  const boxWidth = (CONTENT_WIDTH - 18) / 4;
  const metricsY = doc.y;
  drawMetricBox(doc, MARGIN, metricsY, boxWidth, "Overall Score", `${input.session.overall_score ?? 0}%`, "#111827");
  drawMetricBox(
    doc,
    MARGIN + boxWidth + 6,
    metricsY,
    boxWidth,
    "Automation",
    `${input.session.automation_coverage ?? 0}%`,
    "#111827",
  );
  drawMetricBox(
    doc,
    MARGIN + (boxWidth + 6) * 2,
    metricsY,
    boxWidth,
    "Pages Checked",
    `${input.session.checked_pages}/${input.session.discovered_pages}`,
    "#111827",
  );
  drawMetricBox(
    doc,
    MARGIN + (boxWidth + 6) * 3,
    metricsY,
    boxWidth,
    "Results",
    `${passes.length}/${manuals.length}/${fails.length}`,
    fails.length > 0 ? "#991b1b" : "#166534",
  );

  doc.y = metricsY + 68;
  doc
    .fillColor("#6b7280")
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Scan date: ${new Date(input.session.completed_at || input.session.created_at).toLocaleString()} · Source: ${REQUIREMENTS_SOURCE}`,
      MARGIN,
      doc.y,
      { width: CONTENT_WIDTH },
    );
  doc.moveDown(1.2);

  if (fails.length > 0) {
    drawSectionTitle(doc, `Critical Issues Found (${fails.length})`, "#991b1b");
    doc
      .fillColor("#374151")
      .font("Helvetica")
      .fontSize(9)
      .text(
        "These items failed automated checks and should be fixed on the website before submission.",
        MARGIN,
        doc.y,
        { width: CONTENT_WIDTH },
      );
    doc.moveDown(0.8);
    for (const row of sortResultsForReport(fails)) {
      drawIssueCard(doc, row);
    }
  }

  if (manuals.length > 0) {
    drawSectionTitle(doc, `Manual Review Required (${manuals.length})`, "#854d0e");
    doc
      .fillColor("#374151")
      .font("Helvetica")
      .fontSize(9)
      .text(
        "These items need human verification or supporting documents that cannot be confirmed automatically.",
        MARGIN,
        doc.y,
        { width: CONTENT_WIDTH },
      );
    doc.moveDown(0.8);
    for (const row of sortResultsForReport(manuals).slice(0, 40)) {
      drawIssueCard(doc, row);
    }
    if (manuals.length > 40) {
      doc
        .fillColor("#6b7280")
        .font("Helvetica-Oblique")
        .fontSize(9)
        .text(`+ ${manuals.length - 40} more manual items listed in the detailed section below.`);
      doc.moveDown(0.8);
    }
  }

  drawSectionTitle(doc, "Detailed Checklist");
  for (const [key, rows] of groupResultsByCategory(input.results)) {
    const [category, subCategory] = key.split("::");
    const passCount = rows.filter((row) => row.status === "PASS").length;
    const sectionScore = rows.length ? Math.round((passCount / rows.length) * 100) : 0;

    ensureSpace(doc, 40);
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(category, MARGIN, doc.y);
    doc
      .fillColor("#6b7280")
      .font("Helvetica")
      .fontSize(9)
      .text(`${subCategory} · section score ${sectionScore}%`, MARGIN, doc.y + 14);
    doc.moveDown(1.1);

    for (const row of rows) {
      ensureSpace(doc, 56);
      const itemY = doc.y;
      drawStatusBadge(doc, row.status, MARGIN, itemY);
      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(9.5)
        .text(row.requirement_name, MARGIN + 62, itemY, { width: CONTENT_WIDTH - 62 });
      doc
        .fillColor("#374151")
        .font("Helvetica")
        .fontSize(8.8)
        .text(buildIssueComment(row), MARGIN + 62, itemY + 16, {
          width: CONTENT_WIDTH - 62,
          lineGap: 1.5,
        });
      doc.moveDown(0.9);
    }
    doc.moveDown(0.4);
  }

  doc.end();
  return done;
}

export function pdfFilename(session: RequirementCheckSession): string {
  const date = (session.completed_at || session.created_at).slice(0, 10);
  return `${session.hostname}_Requirements_Check_${date}.pdf`;
}
