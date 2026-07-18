import dns from "node:dns/promises";
import type { IncomingHttpHeaders } from "node:http";
import https from "node:https";
import net from "node:net";
import { convert } from "html-to-text";

import type { AgoojiyePublicSourceRecord } from "./researchPolicy";

const MAX_SOURCE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

function blockedIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && parts[2] === 113) ||
    a >= 224
  );
}

export function isBlockedAgoojiyeSourceAddress(address: string) {
  const normalized = address.trim().toLowerCase();
  const version = net.isIP(normalized);
  if (version === 4) return blockedIpv4(normalized);
  if (version === 6) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff")) return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? blockedIpv4(mapped[1]) : false;
  }
  return true;
}

export function validateAgoojiyeSourceUrl(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error("URL source invalide.");
  }
  if (url.protocol !== "https:") throw new Error("Seules les sources HTTPS publiques sont autorisées.");
  if (url.username || url.password) throw new Error("Les identifiants dans une URL source sont interdits.");
  if (url.port && url.port !== "443") throw new Error("Seul le port HTTPS standard est autorisé.");
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Hôte source privé interdit.");
  }
  if (net.isIP(host) && isBlockedAgoojiyeSourceAddress(host)) throw new Error("Adresse source privée interdite.");
  url.hash = "";
  return url;
}

async function assertPublicHost(url: URL) {
  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isBlockedAgoojiyeSourceAddress(entry.address))) {
    throw new Error("La source ne résout pas exclusivement vers une adresse publique.");
  }
  return addresses;
}

function attributeMap(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of tag.matchAll(pattern)) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  return attributes;
}

function metaContent(html: string, names: string[]) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = attributeMap(tag);
    const key = String(attributes.name || attributes.property || "").toLowerCase();
    if (names.includes(key) && attributes.content) return convert(attributes.content, { wordwrap: false }).trim();
  }
  return "";
}

async function requestPinned(url: URL) {
  const addresses = await assertPublicHost(url);
  const pinned = addresses[0];
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = https.request(
      url,
      {
        method: "GET",
        headers: {
          Accept: "text/html,text/plain;q=0.8",
          "User-Agent": "AGOOJIYE-Public-Research/1.0 (+https://agoojiye.com)",
        },
        lookup: ((_hostname: string, options: { all?: boolean } | undefined, callback: (...args: any[]) => void) => {
          if (options?.all) {
            callback(null, [{ address: pinned.address, family: pinned.family }]);
            return;
          }
          callback(null, pinned.address, pinned.family);
        }) as any,
      },
      (response) => {
        const declared = Number(response.headers["content-length"] || 0);
        if (declared > MAX_SOURCE_BYTES) {
          response.destroy();
          fail(new Error("Source trop volumineuse."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_SOURCE_BYTES) {
            response.destroy();
            fail(new Error("Source trop volumineuse."));
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", (error) => fail(error));
        response.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            status: Number(response.statusCode || 0),
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.setTimeout(10_000, () => request.destroy(new Error("Délai de lecture de la source dépassé.")));
    request.on("error", (error) => fail(error));
    request.end();
  });
}

async function fetchSource(initialUrl: URL) {
  let current = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await requestPinned(current);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location;
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Trop de redirections source.");
      current = validateAgoojiyeSourceUrl(new URL(location, current).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Source HTTP ${response.status}.`);
    const contentType = String(response.headers["content-type"] || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("Type de source non textuel.");
    }
    const html = response.body;
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? convert(titleMatch[1], { wordwrap: false }).trim().slice(0, 300) : "";
    const description = metaContent(html, ["description", "og:description", "twitter:description"]).slice(0, 1_000);
    const excerpt = convert(html, {
      wordwrap: false,
      selectors: [
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "nav", format: "skip" },
        { selector: "footer", format: "skip" },
      ],
    })
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2_000);
    return { finalUrl: current.toString(), title, description, excerpt };
  }
  throw new Error("Source inaccessible.");
}

export async function runAgoojiyePublicSourceResearch(values: unknown[]) {
  const inputs = Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
  if (!inputs.length) throw new Error("Ajoutez au moins une source publique.");
  if (inputs.length > 5) throw new Error("Maximum 5 sources par recherche.");

  const records: AgoojiyePublicSourceRecord[] = [];
  for (const input of inputs) {
    const fetchedAt = new Date().toISOString();
    try {
      const url = validateAgoojiyeSourceUrl(input);
      // Sources are intentionally fetched one by one to keep traffic bounded and auditable.
      // eslint-disable-next-line no-await-in-loop
      const result = await fetchSource(url);
      records.push({
        url: url.toString(),
        finalUrl: result.finalUrl,
        title: result.title || null,
        description: result.description || null,
        excerpt: result.excerpt || null,
        fetchedAt,
        status: "fetched",
        error: null,
      });
    } catch (error: any) {
      records.push({
        url: input,
        finalUrl: null,
        title: null,
        description: null,
        excerpt: null,
        fetchedAt,
        status: "failed",
        error: String(error?.message || error || "Source inaccessible").slice(0, 500),
      });
    }
  }
  return records;
}
