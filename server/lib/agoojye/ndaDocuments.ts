import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ENCRYPTION_VERSION = "aes-256-gcm-v1";
const FILE_MAGIC = Buffer.from("AGOOJIYE-NDA-1\n", "ascii");
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

const SUPPORTED_TYPES = new Map([
  ["application/pdf", { extension: ".pdf", signature: Buffer.from("%PDF-", "ascii") }],
  ["image/jpeg", { extension: ".jpg", signature: Buffer.from([0xff, 0xd8, 0xff]) }],
  ["image/png", { extension: ".png", signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }],
]);

function normalizeMimeType(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function encryptionSecret(explicitSecret?: string) {
  const secret = String(
    explicitSecret || process.env.AGOOJIYE_NDA_ENCRYPTION_SECRET || "",
  ).trim();
  if (secret.length < 32) {
    throw new Error(
      "AGOOJIYE_NDA_ENCRYPTION_SECRET must contain at least 32 characters.",
    );
  }
  return secret;
}

function storageRoot(explicitRoot?: string) {
  return path.resolve(
    explicitRoot ||
      process.env.AGOOJIYE_NDA_STORAGE_DIR ||
      path.join(process.env.UPLOAD_DIR || "/data/uploads", "agoojye-private", "nda"),
  );
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest();
}

function safeStorageKey(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    !normalized ||
    normalized.includes("../") ||
    normalized.startsWith("..") ||
    path.isAbsolute(normalized)
  ) {
    throw new Error("Invalid NDA storage key.");
  }
  return normalized;
}

function resolveStoredPath(root: string, storageKey: string) {
  const target = path.resolve(root, safeStorageKey(storageKey));
  const prefix = `${root}${path.sep}`;
  if (!target.startsWith(prefix)) {
    throw new Error("NDA storage key is outside the private storage root.");
  }
  return target;
}

function encryptBuffer(buffer: Buffer, secret: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBuffer(buffer: Buffer, secret: string) {
  if (!buffer.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) {
    throw new Error("Unsupported NDA document encryption format.");
  }
  const ivStart = FILE_MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + AUTH_TAG_BYTES;
  if (buffer.length <= ciphertextStart) {
    throw new Error("Encrypted NDA document is incomplete.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    buffer.subarray(ivStart, tagStart),
  );
  decipher.setAuthTag(buffer.subarray(tagStart, ciphertextStart));
  return Buffer.concat([
    decipher.update(buffer.subarray(ciphertextStart)),
    decipher.final(),
  ]);
}

export function validateNdaDocument(input: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  const mimeType = normalizeMimeType(input.mimeType);
  const supported = SUPPORTED_TYPES.get(mimeType);
  if (!supported) {
    throw new Error("Le NDA doit être un fichier PDF, JPG ou PNG.");
  }
  if (!input.buffer.length || !input.buffer.subarray(0, supported.signature.length).equals(supported.signature)) {
    throw new Error("Le contenu du fichier ne correspond pas à son format.");
  }
  const cleanName = path
    .basename(String(input.originalName || `nda-signe${supported.extension}`))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 180);
  return {
    mimeType,
    originalName: cleanName || `nda-signe${supported.extension}`,
    extension: supported.extension,
    byteSize: input.buffer.length,
    sha256: createHash("sha256").update(input.buffer).digest("hex"),
  };
}

export async function persistEncryptedNdaDocument(input: {
  tenantId: number;
  engineeringProfileId: number;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  root?: string;
  secret?: string;
}) {
  const validated = validateNdaDocument(input);
  const root = storageRoot(input.root);
  const secret = encryptionSecret(input.secret);
  const directoryKey = `${Math.trunc(input.tenantId)}/${Math.trunc(input.engineeringProfileId)}`;
  const directory = resolveStoredPath(root, directoryKey);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);

  const fileName = `${Date.now()}-${randomBytes(12).toString("hex")}.nda`;
  const storageKey = `${directoryKey}/${fileName}`;
  const target = resolveStoredPath(root, storageKey);
  await writeFile(target, encryptBuffer(input.buffer, secret), {
    flag: "wx",
    mode: 0o600,
  });
  await chmod(target, 0o600);

  return {
    ...validated,
    storageKey,
    encryptionVersion: ENCRYPTION_VERSION,
  };
}

export async function readEncryptedNdaDocument(input: {
  storageKey: string;
  root?: string;
  secret?: string;
}) {
  const root = storageRoot(input.root);
  const secret = encryptionSecret(input.secret);
  const encrypted = await readFile(resolveStoredPath(root, input.storageKey));
  return decryptBuffer(encrypted, secret);
}

export async function removeEncryptedNdaDocument(input: {
  storageKey: string;
  root?: string;
}) {
  const root = storageRoot(input.root);
  await unlink(resolveStoredPath(root, input.storageKey)).catch((error: any) => {
    if (error?.code !== "ENOENT") throw error;
  });
}
