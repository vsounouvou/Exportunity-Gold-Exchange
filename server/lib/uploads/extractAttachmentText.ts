import JSZip from "jszip";
import mammoth from "mammoth";
import { createRequire } from "node:module";

export type AttachmentExtractionStatus =
  | "extracted"
  | "empty"
  | "ocr_required"
  | "visual_review_required"
  | "unsupported"
  | "failed";

export type AttachmentTextExtraction = {
  text: string;
  status: AttachmentExtractionStatus;
  method: string;
  warning?: string;
};

const DEFAULT_MAX_CHARS = 16_000;

function normalizeExtractedText(value: unknown, maxChars: number) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxChars);
}

async function parsePdfText(buffer: Buffer) {
  if (typeof (process as any).getBuiltinModule !== "function") {
    const require = createRequire(import.meta.url);
    (process as any).getBuiltinModule = (id: string) => require(id);
  }
  const moduleValue = (await import("pdf-parse")) as {
    default?: (input: Buffer) => Promise<{ text?: string | null }>;
    PDFParse?: new (options: { data: Buffer }) => {
      getText: () => Promise<{ text?: string | null }>;
      destroy?: () => Promise<void> | void;
    };
  };

  if (typeof moduleValue.default === "function") {
    const parsed = await moduleValue.default(buffer);
    return String(parsed?.text || "");
  }

  if (typeof moduleValue.PDFParse === "function") {
    const parser = new moduleValue.PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return String(parsed?.text || "");
    } finally {
      await Promise.resolve(parser.destroy?.());
    }
  }

  throw new Error("PDF parser module is unavailable");
}

async function parseSpreadsheetText(buffer: Buffer) {
  const moduleValue = (await import("xlsx")) as any;
  const xlsx = moduleValue.default || moduleValue;
  const workbook = xlsx.read(buffer, { type: "buffer", dense: true, cellDates: false });
  const blocks = workbook.SheetNames.map((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return "";
    const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
    return csv.trim() ? `# Sheet: ${sheetName}\n${csv.trim()}` : "";
  }).filter(Boolean);
  return blocks.join("\n\n");
}

function decodeXmlText(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function parsePresentationText(buffer: Buffer) {
  const archive = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(archive.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftIndex = Number(left.match(/slide(\d+)\.xml/i)?.[1] || 0);
      const rightIndex = Number(right.match(/slide(\d+)\.xml/i)?.[1] || 0);
      return leftIndex - rightIndex;
    });

  const slides: string[] = [];
  for (const [index, slideName] of slideNames.entries()) {
    const xml = await archive.file(slideName)?.async("string");
    if (!xml) continue;
    const text = Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi))
      .map((match) => decodeXmlText(match[1] || "").trim())
      .filter(Boolean)
      .join("\n");
    if (text) slides.push(`# Slide ${index + 1}\n${text}`);
  }
  return slides.join("\n\n");
}

function extensionOf(filename: string) {
  const match = String(filename || "").toLowerCase().match(/(\.[a-z0-9]+)$/i);
  return match?.[1] || "";
}

export async function extractAttachmentText(
  file: Pick<Express.Multer.File, "buffer" | "mimetype" | "originalname">,
  options: { maxChars?: number } = {},
): Promise<AttachmentTextExtraction> {
  const maxChars = Math.max(1_000, Math.min(40_000, Math.trunc(options.maxChars || DEFAULT_MAX_CHARS)));
  const mime = String(file.mimetype || "").toLowerCase();
  const filename = String(file.originalname || "attachment");
  const extension = extensionOf(filename);

  try {
    if (
      mime.startsWith("text/") ||
      [".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml", ".log", ".sql"].includes(extension)
    ) {
      const text = normalizeExtractedText(file.buffer.toString("utf8"), maxChars);
      return { text, status: text ? "extracted" : "empty", method: "plain-text" };
    }

    if (mime.includes("pdf") || extension === ".pdf") {
      const text = normalizeExtractedText(await parsePdfText(file.buffer), maxChars);
      const semanticText = text
        .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
        .replace(/page\s+\d+(?:\s+of\s+\d+)?/gi, "")
        .replace(/\s+/g, "")
        .trim();
      if (!text || semanticText.length < 24) {
        return {
          text: "",
          status: "ocr_required",
          method: "pdf-text",
          warning: "No embedded PDF text was found. OCR is required for this scanned document.",
        };
      }
      return { text, status: "extracted", method: "pdf-text" };
    }

    if (
      mime.includes("wordprocessingml") ||
      extension === ".docx"
    ) {
      const parsed = await mammoth.extractRawText({ buffer: file.buffer });
      const text = normalizeExtractedText(parsed.value, maxChars);
      return { text, status: text ? "extracted" : "empty", method: "docx-text" };
    }

    if (
      mime.includes("spreadsheetml") ||
      mime.includes("ms-excel") ||
      extension === ".xlsx" ||
      extension === ".xls"
    ) {
      const text = normalizeExtractedText(await parseSpreadsheetText(file.buffer), maxChars);
      return { text, status: text ? "extracted" : "empty", method: "spreadsheet-text" };
    }

    if (mime.includes("presentationml") || extension === ".pptx") {
      const text = normalizeExtractedText(await parsePresentationText(file.buffer), maxChars);
      return { text, status: text ? "extracted" : "empty", method: "pptx-text" };
    }

    if (mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff"].includes(extension)) {
      return {
        text: "",
        status: "visual_review_required",
        method: "image",
        warning: "The image is linked as evidence. OCR or a vision-capable review is required to extract its contents.",
      };
    }

    if (extension === ".doc" || extension === ".ppt") {
      return {
        text: "",
        status: "unsupported",
        method: "legacy-office",
        warning: "Legacy .doc and .ppt files must be converted to .docx or .pptx for text extraction.",
      };
    }

    return {
      text: "",
      status: "unsupported",
      method: "unsupported",
      warning: `Text extraction is not available for ${mime || extension || "this file type"}.`,
    };
  } catch (error) {
    return {
      text: "",
      status: "failed",
      method: "failed",
      warning: error instanceof Error ? error.message : "Attachment text extraction failed.",
    };
  }
}
