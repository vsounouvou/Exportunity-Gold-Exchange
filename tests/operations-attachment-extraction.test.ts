import assert from "node:assert/strict";
import test from "node:test";

import JSZip from "jszip";

import { extractAttachmentText } from "../server/lib/uploads/extractAttachmentText";

function asUpload(input: { name: string; type: string; buffer: Buffer }) {
  return {
    originalname: input.name,
    mimetype: input.type,
    buffer: input.buffer,
  };
}

test("extracts plain-text meeting evidence", async () => {
  const result = await extractAttachmentText(
    asUpload({
      name: "supplier-brief.txt",
      type: "text/plain",
      buffer: Buffer.from("Objective: qualify three verified suppliers.\nRisk: missing provenance."),
    }),
  );

  assert.equal(result.status, "extracted");
  assert.equal(result.method, "plain-text");
  assert.match(result.text, /qualify three verified suppliers/);
  assert.match(result.text, /missing provenance/);
});

test("extracts ordered text from pptx slide XML", async () => {
  const archive = new JSZip();
  archive.file(
    "ppt/slides/slide2.xml",
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Second slide</a:t><a:t>Delivery plan</a:t></p:sld>',
  );
  archive.file(
    "ppt/slides/slide1.xml",
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>First slide</a:t><a:t>Industrial demand</a:t></p:sld>',
  );
  const buffer = await archive.generateAsync({ type: "nodebuffer" });

  const result = await extractAttachmentText(
    asUpload({
      name: "industrial-plan.pptx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer,
    }),
  );

  assert.equal(result.status, "extracted");
  assert.equal(result.method, "pptx-text");
  assert.ok(result.text.indexOf("First slide") < result.text.indexOf("Second slide"));
  assert.match(result.text, /Delivery plan/);
});

test("labels image evidence for visual review instead of claiming OCR", async () => {
  const result = await extractAttachmentText(
    asUpload({
      name: "invoice.png",
      type: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    }),
  );

  assert.equal(result.status, "visual_review_required");
  assert.equal(result.text, "");
  assert.match(result.warning || "", /OCR or a vision-capable review/i);
});

