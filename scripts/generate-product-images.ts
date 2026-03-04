import "../env";
import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

type ImageSpec = {
  filename: string;
  prompt: string;
};

const OUTPUT_DIR = path.join(process.cwd(), "client", "public", "product-images");

const SPECS: ImageSpec[] = [
  {
    filename: "dore-nuggets-01.png",
    prompt:
      "Ultra-photorealistic premium product photo of raw gold doré nuggets in a small assay tray, rich natural texture, macro detail, museum-grade studio lighting, dark neutral background with subtle bokeh. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp detail.",
  },
  {
    filename: "dore-nuggets-02.png",
    prompt:
      "Ultra-photorealistic premium product photo of raw gold doré nuggets held in a black nitrile gloved hand above a precision scale (scale visible but no readable text). Museum-grade studio lighting, dark neutral background, shallow depth of field. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "dore-dust-01.png",
    prompt:
      "Ultra-photorealistic premium product photo of fine gold dust in a sealed glass vial next to a small assay spoon, dark neutral background, museum-grade studio lighting, sharp macro detail. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024.",
  },
  {
    filename: "dore-lot-01.png",
    prompt:
      "Ultra-photorealistic premium product photo of a small doré lot: rough unrefined gold pieces arranged on black velvet cloth, elegant composition, warm reflections, museum-grade lighting, dark background. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "stamped-bar-01.png",
    prompt:
      "Ultra-photorealistic premium product photo of a small stamped 22K gold bar piece (no readable markings), minimalist studio composition, museum-grade lighting, dark neutral background, luxury presentation case. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "stamped-bar-02.png",
    prompt:
      "Ultra-photorealistic premium product photo of two small stamped gold bars (22K), different angle, placed on a dark satin cloth, soft reflections, studio lighting. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp detail.",
  },
  {
    filename: "stamped-piece-01.png",
    prompt:
      "Ultra-photorealistic premium product photo of a stamped gold piece (10g to 20g, 22K) on a black obsidian stone, dramatic but calm studio lighting, dark background, shallow depth of field. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024.",
  },
  {
    filename: "custom-ring-02.png",
    prompt:
      "Ultra-photorealistic premium product photo of a handcrafted gold ring (18K to 22K), angled macro shot, placed on dark velvet, museum-grade studio lighting, shallow depth of field. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp detail.",
  },
  {
    filename: "jewelry-chain-02.png",
    prompt:
      "Ultra-photorealistic premium product photo of a handcrafted gold chain (18K to 22K), close-up diagonal composition, dark neutral background, studio lighting with soft bokeh highlights. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024.",
  },
  {
    filename: "jewelry-bracelet-02.png",
    prompt:
      "Ultra-photorealistic premium product photo of a handcrafted gold bracelet (18K to 22K), macro detail, placed on black satin cloth, museum-grade lighting. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024.",
  },
  {
    filename: "art-bust-02.png",
    prompt:
      "Ultra-photorealistic premium product photo of a museum-grade gold portrait bust (African-inspired), alternate angle, dark neutral background, museum-grade studio lighting, subtle reflections, shallow depth of field. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024.",
  },
  {
    filename: "art-medallion-02.png",
    prompt:
      "Ultra-photorealistic premium product photo of a solid gold medallion (African-inspired relief), macro shot on dark stone surface, museum-grade lighting, crisp detail. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024.",
  },
  {
    filename: "jewelry-chain.png",
    prompt:
      "Ultra-photorealistic premium product photo of a handcrafted gold chain (18K to 22K), minimalist design, museum-grade studio lighting, dark neutral background, placed in a luxury presentation case (coffret). No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "jewelry-bracelet.png",
    prompt:
      "Ultra-photorealistic premium product photo of a handcrafted gold bracelet (18K to 22K), elegant link design, museum-grade studio lighting, dark neutral background, luxury presentation case (coffret). No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "jewelry-earrings.png",
    prompt:
      "Ultra-photorealistic premium product photo of handcrafted gold earrings (18K to 22K), small hoop style, museum-grade studio lighting, dark neutral background, luxury presentation case (coffret). No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "jewelry-pendant.png",
    prompt:
      "Ultra-photorealistic premium product photo of a handcrafted gold pendant (18K to 22K), minimalist medallion style, museum-grade studio lighting, dark neutral background, luxury presentation case (coffret). No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "art-bust.png",
    prompt:
      "Ultra-photorealistic premium product photo of a museum-grade gold portrait bust (African-inspired, dignified calm expression), crafted as an 18K to 22K gold art object. Museum-grade studio lighting, subtle reflections, luxury presentation box (coffret), dark neutral background, shallow depth of field. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "art-medallion.png",
    prompt:
      "Ultra-photorealistic premium product photo of a solid gold medallion with a subtle face relief (African-inspired), 18K to 22K gold. Museum-grade studio lighting, luxury case (coffret), dark neutral background, sharp details. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "art-ceremonial.png",
    prompt:
      "Ultra-photorealistic premium product photo of a refined ceremonial gold art object (African-inspired but contemporary, elegant), 18K to 22K gold. Museum-grade lighting, luxury presentation case, dark neutral background. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "custom-ring.png",
    prompt:
      "Ultra-photorealistic premium product photo of a handcrafted gold ring made by a certified jewelry manufacturer, 18K to 22K gold. Minimal, elegant, museum-grade lighting, luxury case (coffret), dark neutral background. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "gold-card.png",
    prompt:
      "Ultra-photorealistic premium product photo of a thin solid gold card (investment gold card), 18K to 22K gold, with subtle embossed portrait relief. Luxury presentation box, dark neutral background, museum-grade studio lighting, sharp details. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
  {
    filename: "gold-coin.png",
    prompt:
      "Ultra-photorealistic premium product photo of a solid gold coin with a subtle portrait relief, 18K to 22K gold, in a luxury presentation case. Dark neutral background, museum-grade studio lighting, sharp details. No text, no letters, no numbers, no watermark, no logo. Square, 1024x1024, sharp macro detail.",
  },
];

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY in environment. Set it in `.env` then re-run.");
    process.exitCode = 1;
    return;
  }

  await ensureDir(OUTPUT_DIR);

  const openai = new OpenAI({ apiKey });

  for (const spec of SPECS) {
    const outPath = path.join(OUTPUT_DIR, spec.filename);
    if (await fileExists(outPath)) {
      console.log(`skip ${spec.filename} (already exists)`);
      continue;
    }

    console.log(`generate ${spec.filename}`);
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: spec.prompt,
      size: "1024x1024",
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`No image returned for ${spec.filename}`);
    }

    const buffer = Buffer.from(b64, "base64");
    await fs.writeFile(outPath, buffer);
  }

  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
