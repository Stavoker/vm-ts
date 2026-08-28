import PDFDocument from "pdfkit";
import type { RequirementCheckSession, RequirementResultRow } from "../types";
import { REQUIREMENTS_SOURCE } from "../constants";

export async function generateRequirementsPdf(input: {
  session: RequirementCheckSession;
  results: RequirementResultRow[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(18).text("Requirements Check Report", { underline: true });
  doc.moveDown();
  doc.fontSize(11);
  doc.text(`Website: ${input.session.hostname}`);
  doc.text(`URL: ${input.session.website_url}`);
  doc.text(`Scan date: ${new Date(input.session.created_at).toLocaleString()}`);
  doc.text(`Overall Score: ${input.session.overall_score ?? 0}%`);
  doc.text(`Automation Coverage: ${input.session.automation_coverage ?? 0}%`);
  doc.text(`Pages discovered: ${input.session.discovered_pages}`);
  doc.text(`Pages checked: ${input.session.checked_pages}`);
  doc.text(`PASS: ${input.session.passed_requirements}  MANUAL: ${input.session.manual_requirements}  FAIL: ${input.session.failed_requirements}`);
  doc.moveDown();
  doc.text(`Source: ${REQUIREMENTS_SOURCE}`);
  doc.moveDown();

  let currentCategory = "";
  let currentSub = "";
  for (const row of input.results) {
    if (row.requirement_category !== currentCategory) {
      currentCategory = row.requirement_category;
      doc.moveDown().fontSize(14).text(currentCategory, { underline: true });
      doc.fontSize(10);
    }
    if (row.requirement_sub_category !== currentSub) {
      currentSub = row.requirement_sub_category;
      doc.moveDown().fontSize(11).text(currentSub);
    }
    doc.moveDown(0.3);
    doc.fontSize(10).text(`${row.status} — ${row.requirement_name}`);
    doc.text(row.explanation, { indent: 12 });
    if (row.checked_url) doc.text(`Checked URL: ${row.checked_url}`, { indent: 12 });
    if (row.evidence?.manualInstruction) {
      doc.text(`Manual instruction: ${row.evidence.manualInstruction}`, { indent: 12 });
    }
  }

  doc.end();
  return done;
}

export function pdfFilename(session: RequirementCheckSession): string {
  const date = (session.completed_at || session.created_at).slice(0, 10);
  return `${session.hostname}_Requirements_Check_${date}.pdf`;
}
