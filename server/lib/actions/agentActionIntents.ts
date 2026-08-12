import { createHash } from "crypto";
import { normalizeAgentKey } from "../mail/agentSlugs";

export type DispatchableActionType =
  | "SEND_EMAIL"
  | "SEND_SMS"
  | "SEND_WHATSAPP"
  | "CREATE_CONTACT"
  | "CREATE_AGENT"
  | "BULK_CREATE_AGENTS"
  | "UPDATE_AGENT_MODEL"
  | "ASSIGN_AGENT_TO_CONVERSATION"
  | "CREATE_SHOP"
  | "CREATE_TASK"
  | "CREATE_MEETING_LINK"
  | "SEND_MEETING_INVITE"
  | "REQUEST_MEETING_SUMMARY"
  | "START_BACKGROUND_SESSION"
  | "CONFIGURE_RECURRING_MEETING";

export type ParsedAgentActionIntent = {
  actionType: DispatchableActionType;
  payload: Record<string, unknown>;
  source: "structured" | "heuristic";
};

export type DispatchCreatedAction = {
  id: number;
  status: string;
  state?: string | null;
  publicActionId?: string | null;
  actionType: DispatchableActionType;
  targetCount?: number | null;
  correlationId: string;
};

export type DispatchAgentActionsResult = {
  intentsDetected: number;
  created: DispatchCreatedAction[];
  blocked: string[];
};

export type DispatchAgentActionsInput = {
  text: string;
  allowHeuristics?: boolean;
  tenantId: number | null | undefined;
  conversationId: string;
  source: string;
  companyId?: number | null;
  channelId?: string | null;
  meetingId?: number | null;
  messageId?: number | null;
  requestedByUserId?: number | null;
  fallbackRecipientEmails?: string[] | null;
  isAdmin?: boolean;
  agent?: {
    id?: number | null;
    name?: string | null;
    role?: string | null;
    agentKey?: string | null;
  } | null;
};

type CreateActionRequestInput = {
  tenantId: number;
  requestedByUserId: number | null;
  requestedByAgentKey?: string | null;
  actionType: DispatchableActionType;
  payload: Record<string, unknown>;
  priority?: number;
  idempotencyKey?: string | null;
  relatedConversationId?: string | null;
  relatedThreadId?: number | null;
  isAdmin?: boolean;
};

type CreateActionRequestResult = {
  id: number;
  status: string;
  state?: string | null;
  lifecycleState?: string | null;
  publicActionId?: string | null;
  public_action_id?: string | null;
};
type CreateActionRequestFn = (input: CreateActionRequestInput) => Promise<CreateActionRequestResult>;

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+?[1-9]\d{7,14})/g;
const ACTION_BLOCK_REGEX = /\[\[\s*ACTION\s*:\s*[A-Z_]+[\s\S]*?\]\]/gi;
const XML_ACTION_BLOCK_REGEX = /<action>[\s\S]*?<\/action>/gi;
const ACTION_MARKER_LINE_REGEX = /^\s*\*{0,2}\s*action\s*:\s*[a-z_]+\b[\s\S]*$/gim;
const ACTION_MARKER_LINE_TEST = /^\s*\*{0,2}\s*action\s*:\s*[a-z_]+\b/i;

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return uniqueStrings(value.map((entry) => String(entry || "")));
  if (typeof value === "string") return uniqueStrings(value.split(/[,\s]+/g));
  return [] as string[];
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function parseOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function parseOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

const AGENT_COUNT_WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

function clampAgentCount(value: number | null | undefined) {
  if (!Number.isFinite(value as number)) return null;
  return Math.max(1, Math.min(100, Math.trunc(value as number)));
}

function parseAgentCountCandidate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampAgentCount(value);
  }
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return clampAgentCount(numeric);
    const lowered = text.toLowerCase().replace(/-/g, " ").trim();
    const tokens = lowered.split(/\s+/g).filter(Boolean);
    if (!tokens.length) return null;
    if (tokens.length === 1 && AGENT_COUNT_WORD_TO_NUMBER[tokens[0]] != null) {
      return clampAgentCount(AGENT_COUNT_WORD_TO_NUMBER[tokens[0]]);
    }
    if (tokens.length >= 2) {
      const first = AGENT_COUNT_WORD_TO_NUMBER[tokens[0]];
      const second = AGENT_COUNT_WORD_TO_NUMBER[tokens[1]];
      if (first != null && second != null) {
        if (first >= 20 && first % 10 === 0 && second >= 1 && second <= 9) {
          return clampAgentCount(first + second);
        }
        if (first === 100 && second >= 1 && second <= 99) {
          return clampAgentCount(first + second);
        }
      }
    }
  }
  return null;
}

function inferAgentCountFromText(text: string) {
  const raw = String(text || "");
  const numericMatch = raw.match(/\b(\d{1,3})(?:\s+[a-z][a-z0-9_-]{1,30}){0,3}\s+(?:agents?|assistants?)\b/i);
  if (numericMatch) {
    return clampAgentCount(Number(numericMatch[1]));
  }

  const wordRegex =
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?(?:\s+[a-z][a-z0-9_-]{1,30}){0,3}\s+(?:agents?|assistants?)\b/i;
  const wordMatch = raw.match(wordRegex);
  if (wordMatch) {
    const first = parseAgentCountCandidate(wordMatch[1]);
    const second = parseAgentCountCandidate(wordMatch[2]);
    if (first != null && second != null && first >= 20 && first % 10 === 0 && second >= 1 && second <= 9) {
      return clampAgentCount(first + second);
    }
    if (first != null) return clampAgentCount(first);
  }

  return null;
}

function resolveAgentRequestCount(payload: Record<string, unknown>, fallbackText: string, defaultCount = 1) {
  const directCandidates: unknown[] = [
    payload.count,
    payload.quantity,
    payload.total,
    payload.numberOfAgents,
    payload.number_of_agents,
    payload.agentCount,
    payload.agentsCount,
    payload.agent_count,
    payload.agents_count,
    payload.size,
    payload.targetCount,
    payload.target_count,
  ];

  for (const candidate of directCandidates) {
    const parsed = parseAgentCountCandidate(candidate);
    if (parsed != null) return parsed;
  }

  const inferred = inferAgentCountFromText(fallbackText);
  if (inferred != null) return inferred;

  return clampAgentCount(defaultCount) ?? 1;
}

function extractAgentNamesFromPayload(payload: Record<string, unknown>) {
  return uniqueStrings([
    ...asStringArray(payload.names),
    ...asStringArray(payload.agentNames),
    ...asStringArray(payload.agent_names),
  ]);
}

function buildBulkAgentEntries(input: {
  count: number;
  names: string[];
  baseName?: string | null;
  role?: string | null;
  department?: string | null;
  runtimeModel?: string | null;
  toolsEnabled?: string[];
  status?: string | null;
}) {
  const count = clampAgentCount(input.count) ?? 1;
  const names = uniqueStrings(input.names || []);
  const baseName = firstNonEmptyString(input.baseName, "Agent") || "Agent";
  const role = firstNonEmptyString(input.role, "Agent") || "Agent";
  const department = firstNonEmptyString(input.department);
  const runtimeModel = firstNonEmptyString(input.runtimeModel);
  const toolsEnabled = Array.isArray(input.toolsEnabled) ? uniqueStrings(input.toolsEnabled) : [];
  const status = firstNonEmptyString(input.status);

  return Array.from({ length: count }).map((_, index) => ({
    name: names[index] || `${baseName} ${index + 1}`,
    role,
    department,
    runtimeModel,
    toolsEnabled,
    status,
  }));
}

function extractRecurringPayload(payload: Record<string, unknown>) {
  const recurringRaw =
    payload.recurring && typeof payload.recurring === "object" && !Array.isArray(payload.recurring)
      ? (payload.recurring as Record<string, unknown>)
      : {};
  const hasExplicitRecurring =
    Object.keys(recurringRaw).length > 0 ||
    payload.recurringEnabled != null ||
    payload.intervalMinutes != null ||
    payload.everyMinutes != null ||
    payload.repeatEveryMinutes != null ||
    payload.maxRuns != null;
  if (!hasExplicitRecurring) return null;

  const enabled =
    parseOptionalBoolean(
      recurringRaw.enabled ??
        recurringRaw.active ??
        payload.recurringEnabled ??
        payload.recurring_enabled ??
        payload.repeatEnabled,
    ) ?? true;
  const intervalMinutesRaw = parseOptionalNumber(
    recurringRaw.intervalMinutes ??
      recurringRaw.everyMinutes ??
      payload.intervalMinutes ??
      payload.everyMinutes ??
      payload.repeatEveryMinutes ??
      payload.repeat_every_minutes,
  );
  const maxRunsRaw = parseOptionalNumber(
    recurringRaw.maxRuns ??
      recurringRaw.max_iterations ??
      payload.maxRuns ??
      payload.max_iterations ??
      payload.repeatCount ??
      payload.repeat_count,
  );
  const runIndexRaw = parseOptionalNumber(recurringRaw.runIndex ?? recurringRaw.iteration ?? payload.runIndex);

  return {
    enabled,
    intervalMinutes: Number.isFinite(intervalMinutesRaw as number)
      ? Math.max(1, Math.min(24 * 60, Math.trunc(intervalMinutesRaw as number)))
      : 24 * 60,
    maxRuns: Number.isFinite(maxRunsRaw as number) ? Math.max(1, Math.min(500, Math.trunc(maxRunsRaw as number))) : 20,
    runIndex: Number.isFinite(runIndexRaw as number) ? Math.max(1, Math.trunc(runIndexRaw as number)) : 1,
  };
}

function normalizeActionType(value: string): DispatchableActionType | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (
    normalized === "SEND_EMAIL" ||
    normalized === "SEND_SMS" ||
    normalized === "SEND_WHATSAPP" ||
    normalized === "CREATE_CONTACT" ||
    normalized === "CREATE_AGENT" ||
    normalized === "BULK_CREATE_AGENTS" ||
    normalized === "UPDATE_AGENT_MODEL" ||
    normalized === "ASSIGN_AGENT_TO_CONVERSATION" ||
    normalized === "CREATE_SHOP" ||
    normalized === "CREATE_TASK" ||
    normalized === "CREATE_MEETING_LINK" ||
    normalized === "SEND_MEETING_INVITE" ||
    normalized === "REQUEST_MEETING_SUMMARY" ||
    normalized === "START_BACKGROUND_SESSION" ||
    normalized === "CONFIGURE_RECURRING_MEETING"
  ) {
    return normalized;
  }
  return null;
}

function findMatchingCurlyBrace(text: string, openIndex: number) {
  if (openIndex < 0 || openIndex >= text.length || text[openIndex] !== "{") return -1;

  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (ch === "\"" || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function stripSingleBracketActionBlocks(text: string) {
  const raw = String(text || "");
  const upper = raw.toUpperCase();
  let out = "";
  let cursor = 0;

  while (cursor < raw.length) {
    const start = upper.indexOf("[ACTION:", cursor);
    if (start === -1) break;

    out += raw.slice(cursor, start);

    const braceStart = raw.indexOf("{", start);
    if (braceStart === -1) {
      cursor = start + 1;
      out += raw.slice(start, cursor);
      continue;
    }

    const braceEnd = findMatchingCurlyBrace(raw, braceStart);
    if (braceEnd === -1) {
      cursor = start + 1;
      out += raw.slice(start, cursor);
      continue;
    }

    let end = braceEnd + 1;
    const close = raw.indexOf("]", end);
    if (close !== -1) end = close + 1;

    out += " ";
    cursor = end;
  }

  out += raw.slice(cursor);
  return out;
}

function stripAllActionBlocks(text: string) {
  const raw = String(text || "");
  const withoutXml = raw.replace(XML_ACTION_BLOCK_REGEX, " ");
  const withoutDouble = withoutXml.replace(ACTION_BLOCK_REGEX, " ");
  const withoutSingle = stripSingleBracketActionBlocks(withoutDouble);
  return withoutSingle;
}

function parseStructuredActionBlocks(text: string): ParsedAgentActionIntent[] {
  const intents: ParsedAgentActionIntent[] = [];
  const matcher = /\[\[\s*ACTION\s*:\s*([A-Z_]+)\s*([\s\S]*?)\]\]/gi;
  let match: RegExpExecArray | null = null;
  while ((match = matcher.exec(text)) !== null) {
    const actionType = normalizeActionType(match[1] || "");
    if (!actionType) continue;

    const payloadText = String(match[2] || "").trim();
    let payload: Record<string, unknown> = {};

    if (payloadText.startsWith("{")) {
      try {
        const parsed = JSON.parse(payloadText);
        payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        payload = {};
      }
    }

    intents.push({ actionType, payload, source: "structured" });
  }
  return intents;
}

function parseSingleBracketStructuredActionBlocks(text: string): ParsedAgentActionIntent[] {
  const intents: ParsedAgentActionIntent[] = [];
  const raw = String(text || "");
  const upper = raw.toUpperCase();

  let cursor = 0;
  while (cursor < raw.length) {
    const start = upper.indexOf("[ACTION:", cursor);
    if (start === -1) break;

    let i = start + "[ACTION:".length;
    while (i < raw.length && /\s/.test(raw[i])) i += 1;

    const typeStart = i;
    while (i < raw.length && /[A-Z_]/i.test(raw[i])) i += 1;
    const actionType = normalizeActionType(raw.slice(typeStart, i));
    if (!actionType) {
      cursor = start + 1;
      continue;
    }

    const braceStart = raw.indexOf("{", i);
    if (braceStart === -1) {
      cursor = start + 1;
      continue;
    }

    const braceEnd = findMatchingCurlyBrace(raw, braceStart);
    if (braceEnd === -1) {
      cursor = start + 1;
      continue;
    }

    const payloadText = raw.slice(braceStart, braceEnd + 1).trim();
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(payloadText);
      payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      payload = {};
    }

    intents.push({ actionType, payload, source: "structured" });
    cursor = braceEnd + 1;
  }

  return intents;
}

function parseHeuristicEmailIntent(text: string): ParsedAgentActionIntent | null {
  const lower = text.toLowerCase();
  const emails = uniqueStrings((text.match(EMAIL_REGEX) || []).map((entry) => entry.toLowerCase()));
  const hasEmailVerb = /\b(send|email|mail|resend|notify)\b/i.test(text);
  const explicitEmailIntent = /\b(send|draft|queue)\b.{0,30}\bemail\b/i.test(text) || /\bemail\s+to\b/i.test(text);

  if (!(hasEmailVerb && (emails.length > 0 || explicitEmailIntent))) return null;
  if (!emails.length) return { actionType: "SEND_EMAIL", payload: {}, source: "heuristic" };

  const subjectMatch =
    text.match(/\bsubject\b\s*[:=-]\s*["“]?([^"\n”]{3,180})/i) ||
    text.match(/\bwith\s+subject\b\s*["“]?([^"\n”]{3,180})/i);
  const bodyMatch =
    text.match(/\b(?:body|message|content)\b\s*[:=-]\s*([\s\S]{3,1000})/i) ||
    text.match(/\bemail\s+to\b[\s\S]{0,80}\bthat\b[\s,:-]*([\s\S]{3,1000})/i);

  const subject = subjectMatch?.[1]?.trim() || `Action requested from conversation`;
  const bodyText = bodyMatch?.[1]?.trim() || stripAgentActionMarkers(text) || text.trim();

  return {
    actionType: "SEND_EMAIL",
    payload: {
      to: emails,
      subject,
      body: { text: bodyText },
    },
    source: "heuristic",
  };
}

function parseHeuristicMessageIntent(
  text: string,
  channel: "sms" | "whatsapp",
): ParsedAgentActionIntent | null {
  const phones = uniqueStrings((text.match(PHONE_REGEX) || []).map((entry) => entry.replace(/[^\d+]/g, "")));
  const wantsSms = /\b(sms|text\s+message|text)\b/i.test(text);
  const wantsWhatsapp = /\b(whatsapp|wa\s+message|wa)\b/i.test(text);
  const active = channel === "sms" ? wantsSms : wantsWhatsapp;
  if (!active) return null;

  const actionType: DispatchableActionType = channel === "sms" ? "SEND_SMS" : "SEND_WHATSAPP";
  if (!phones.length) return { actionType, payload: {}, source: "heuristic" };

  const messageMatch = text.match(/\b(?:message|body|text)\b\s*[:=-]\s*([\s\S]{2,500})/i);
  const body = messageMatch?.[1]?.trim() || text.trim();

  return {
    actionType,
    payload: {
      toE164: phones[0],
      body,
      mode: "text",
    },
    source: "heuristic",
  };
}

function parseHeuristicCreateContactIntent(text: string): ParsedAgentActionIntent | null {
  const wantsCreate =
    /\b(create|add|save|register|record|capture)\b/i.test(text) &&
    /\b(contact|lead|prospect|customer)\b/i.test(text);
  if (!wantsCreate) return null;

  const emails = uniqueStrings((text.match(EMAIL_REGEX) || []).map((entry) => entry.toLowerCase()));
  const phones = uniqueStrings((text.match(PHONE_REGEX) || []).map((entry) => entry.replace(/[^\d+]/g, "")));

  const nameMatch =
    text.match(/\b(?:name|contact(?:\s+name)?)\s*[:=-]\s*["“]?([^"\n”]{2,140})/i) ||
    text.match(/\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
  const companyMatch = text.match(/\b(?:company|business)\s*[:=-]\s*["“]?([^"\n”]{2,160})/i);
  const roleMatch = text.match(/\b(?:title|role|job)\s*[:=-]\s*["“]?([^"\n”]{2,120})/i);
  const notesMatch = text.match(/\b(?:notes?|note)\s*[:=-]\s*([\s\S]{3,600})/i);
  const recurring = parseRecurringFromText(text);

  const payload: Record<string, unknown> = {
    displayName: nameMatch?.[1]?.trim() || null,
    company: companyMatch?.[1]?.trim() || null,
    jobTitle: roleMatch?.[1]?.trim() || null,
    emails,
    phones,
    notes: notesMatch?.[1]?.trim() || null,
    ...(recurring ? { recurring } : {}),
  };

  return {
    actionType: "CREATE_CONTACT",
    payload,
    source: "heuristic",
  };
}

function parseHeuristicCreateAgentIntent(text: string): ParsedAgentActionIntent | null {
  const wantsCreate =
    /\b(create|add|hire|onboard|recruit|setup|set up)\b/i.test(text) &&
    /\b(agent|agents|assistant|assistants)\b/i.test(text);
  if (!wantsCreate) return null;

  const count = resolveAgentRequestCount({}, text, 1);
  const model =
    firstNonEmptyString(
      text.match(/\bmodel\s*[:=-]\s*([a-z0-9._:-]{3,80})/i)?.[1],
      text.match(/\busing\s+([a-z0-9._:-]{3,80})\s+model\b/i)?.[1],
    ) || null;
  const role = firstNonEmptyString(text.match(/\brole\s*[:=-]\s*([^,\n]{2,120})/i)?.[1], "Agent");
  const department = firstNonEmptyString(text.match(/\bdepartment\s*[:=-]\s*([^,\n]{2,120})/i)?.[1], null);
  const names = Array.from(text.matchAll(/\b(?:named|name)\s*[:=-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g)).map((m) =>
    String(m[1] || "").trim(),
  );

  if (count > 1) {
    const agents = buildBulkAgentEntries({
      count,
      names,
      role,
      department,
      runtimeModel: model,
      toolsEnabled: [],
      baseName: "Agent",
    });
    return { actionType: "BULK_CREATE_AGENTS", payload: { agents }, source: "heuristic" };
  }

  return {
    actionType: "CREATE_AGENT",
    payload: {
      name: names[0] || "New Agent",
      role,
      department,
      runtimeModel: model,
      toolsEnabled: [],
    },
    source: "heuristic",
  };
}

function parseHeuristicCreateShopIntent(text: string): ParsedAgentActionIntent | null {
  const wantsCreate =
    /\b(create|open|register|add|setup|set up)\b/i.test(text) &&
    /\b(shop|store|boutique|business)\b/i.test(text);
  if (!wantsCreate) return null;

  const shopNameMatch =
    text.match(/\b(?:shop(?:\s+name)?|store(?:\s+name)?|boutique(?:\s+name)?)\s*[:=-]\s*["“]?([^"\n”]{2,180})/i) ||
    text.match(/\bnamed\s+["“]?([^"\n”]{2,180})/i);
  const legalEntityMatch = text.match(/\b(?:legal(?:\s+entity)?|business\s*registration)\s*[:=-]\s*["“]?([^"\n”]{2,180})/i);
  const taxIdMatch = text.match(/\b(?:tax\s*id|tin|vat)\s*[:=-]\s*["“]?([^"\n”]{2,100})/i);
  const phoneMatch = (text.match(PHONE_REGEX) || [])[0] || null;
  const emailMatch = (text.match(EMAIL_REGEX) || [])[0] || null;
  const recurring = parseRecurringFromText(text);

  return {
    actionType: "CREATE_SHOP",
    payload: {
      shopName: shopNameMatch?.[1]?.trim() || null,
      legalEntity: legalEntityMatch?.[1]?.trim() || null,
      taxId: taxIdMatch?.[1]?.trim() || null,
      email: emailMatch ? String(emailMatch).toLowerCase() : null,
      phoneNumber: phoneMatch ? String(phoneMatch).replace(/[^\d+]/g, "") : null,
      ...(recurring ? { recurring } : {}),
    },
    source: "heuristic",
  };
}

function normalizeTaskRequestText(text: string) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019']/g, " ")
    .toLowerCase();
}

function parseHeuristicCreateTaskIntent(text: string): ParsedAgentActionIntent | null {
  const normalized = normalizeTaskRequestText(text);
  const explicitlyRejectsTask =
    /\b(?:do not|dont|without)\s+(?:create|add|assign|open|track|schedule|creating|adding)\b[^.!?\n]{0,100}\b(?:task|todo|to-do|action item|follow-?up)s?\b/i.test(normalized) ||
    /\bne\s+(?:cree|creer|creez|ajoute|ajouter|ajoutez|assigne|assigner|ouvrez|ouvrir|planifie|planifier)\s+(?:pas|aucun|aucune)\b[^.!?\n]{0,100}\b(?:tache|todo|suivi)s?\b/i.test(normalized) ||
    /\bsans\s+(?:creer|ajouter|assigner|ouvrir|planifier)\b[^.!?\n]{0,100}\b(?:tache|todo|suivi)s?\b/i.test(normalized);
  if (explicitlyRejectsTask) return null;

  const wantsCreate =
    /\b(create|add|assign|open|track|schedule|cree|creer|creez|ajoute|ajouter|ajoutez|assigne|assigner|ouvrez|ouvrir|planifie|planifier|enregistre|enregistrer)\b/i.test(normalized) &&
    /\b(task|tasks|todo|to-do|action item|follow-?up|tache|taches|suivi)\b/i.test(normalized);
  if (!wantsCreate) return null;

  const quotedTitleMatch = text.match(/["\u00ab\u201c]([^"\u00bb\u201d\n]{3,220})["\u00bb\u201d]/u);
  const titleMatch =
    text.match(/\b(?:task|todo|action item|follow-?up|t(?:a|\u00e2)che)\s*[:=-]\s*["\u00ab\u201c]?([^"\u00bb\u201d\n]{3,220})/iu) ||
    text.match(/\b(?:assign|create|cr(?:e|\u00e9)e|ajoute)\s+(?:a|une?)?\s*(?:task|t(?:a|\u00e2)che)\s+(?:to|for|pour|a|\u00e0)\s+([^\n,.]{3,180})/iu);
  const dueDateMatch = normalized.match(/\b(?:due|deadline|echeance)\s*[:=-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\b/i);
  const priorityMatch = normalized.match(
    /\b(?:priority|priorite)\s*[:=-]?\s*(low|medium|high|urgent|basse?|faible|moyenne?|haute?|elevee?|urgente?)\b/i,
  );
  const descriptionMatch = text.match(
    /\bdescription\s*:\s*([\s\S]*?)(?=(?:\n|\.\s+(?:do not|dont|no other|ne\s|sans\s))|$)/i,
  );
  const recurring = parseRecurringFromText(text);
  const cleaned = stripAgentActionMarkers(text).trim();
  const rawPriority = priorityMatch?.[1]?.toLowerCase() || "medium";
  const priority =
    ["low", "basse", "bas", "faible"].includes(rawPriority)
      ? "low"
      : ["high", "haute", "haut", "elevee", "eleve"].includes(rawPriority)
        ? "high"
        : ["urgent", "urgente"].includes(rawPriority)
          ? "urgent"
          : "medium";

  return {
    actionType: "CREATE_TASK",
    payload: {
      title: quotedTitleMatch?.[1]?.trim() || titleMatch?.[1]?.trim() || cleaned.slice(0, 180) || "Follow-up task",
      description: descriptionMatch?.[1]?.trim() || cleaned || null,
      dueDate: dueDateMatch?.[1] || null,
      priority,
      ...(recurring ? { recurring } : {}),
    },
    source: "heuristic",
  };
}

export function extractExplicitCreateTaskIntent(text: string): ParsedAgentActionIntent | null {
  return parseHeuristicCreateTaskIntent(String(text || ""));
}

function parseHeuristicMeetingIntent(text: string): ParsedAgentActionIntent | null {
  const lower = text.toLowerCase();
  const wantsMeeting = /\b(meeting|call|video call|meet)\b/i.test(text);
  if (!wantsMeeting) return null;

  const wantsCreate = /\b(create|schedule|start|open|generate)\b/i.test(text) && /\b(link|invite|meeting|call)\b/i.test(text);
  const wantsInviteSend = /\b(send|share|invite)\b/i.test(text) && /\b(link|invite)\b/i.test(text);
  const wantsSummary = /\b(summary|recap|minutes|action items)\b/i.test(text) && /\bmeeting|call\b/i.test(text);

  const meetingIdMatch =
    text.match(/\bmeeting(?:\s*id)?\s*[:=#-]\s*([a-z0-9-]{6,64})/i) ||
    text.match(/\bfor\s+meeting\s+([a-z0-9-]{6,64})/i);
  const meetingId = meetingIdMatch?.[1]?.trim() || "";

  if (wantsSummary) {
    return {
      actionType: "REQUEST_MEETING_SUMMARY",
      payload: meetingId ? { meetingId } : {},
      source: "heuristic",
    };
  }

  if (wantsInviteSend && meetingId) {
    const emails = uniqueStrings((text.match(EMAIL_REGEX) || []).map((entry) => entry.toLowerCase()));
    return {
      actionType: "SEND_MEETING_INVITE",
      payload: {
        meetingId,
        recipients: emails,
      },
      source: "heuristic",
    };
  }

  if (wantsCreate) {
    const titleMatch = text.match(/\b(?:title|subject|meeting)\s*[:=-]\s*["â€œ]?([^"\nâ€]{3,140})/i);
    const title = titleMatch?.[1]?.trim() || "Meeting";
    return {
      actionType: "CREATE_MEETING_LINK",
      payload: { title },
      source: "heuristic",
    };
  }

  return null;
}

function parseDurationMinutes(text: string, fallback: number) {
  const explicitMinutes = text.match(/\b(?:for|run for|duration)\s*(\d{1,4})\s*(?:minutes?|mins?|m)\b/i);
  if (explicitMinutes) {
    const minutes = Number(explicitMinutes[1]);
    if (Number.isFinite(minutes) && minutes > 0) return Math.min(24 * 60, Math.max(1, Math.trunc(minutes)));
  }

  const explicitHours = text.match(/\b(?:for|run for|duration)\s*(\d{1,3})\s*(?:hours?|hrs?|h)\b/i);
  if (explicitHours) {
    const hours = Number(explicitHours[1]);
    if (Number.isFinite(hours) && hours > 0) return Math.min(24 * 60, Math.max(1, Math.trunc(hours * 60)));
  }

  return fallback;
}

function parseRecurringIntervalMinutes(text: string, fallback: number) {
  if (/\b(daily|every day|chaque jour|quotidien)\b/i.test(text)) return 24 * 60;
  if (/\b(weekly|every week|chaque semaine|hebdomadaire)\b/i.test(text)) return 7 * 24 * 60;
  if (/\b(monthly|every month|chaque mois|mensuel)\b/i.test(text)) return 30 * 24 * 60;

  const match = text.match(/\bevery\s+(\d{1,4})\s*(minutes?|mins?|m|hours?|hrs?|h)\b/i);
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  const unit = String(match[2] || "").toLowerCase();
  const multiplier = unit.startsWith("h") ? 60 : 1;
  return Math.min(24 * 60, Math.max(1, Math.trunc(value * multiplier)));
}

function parseRecurringMaxRuns(text: string, fallback: number) {
  const explicit = text.match(/\b(?:for|repeat for|max(?:imum)? runs?)\s*(\d{1,4})\s*(?:times?|runs?|iterations?)\b/i);
  if (!explicit) return fallback;
  const value = Number(explicit[1]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.min(500, Math.trunc(value)));
}

function parseRecurringFromText(text: string) {
  const wantsRecurring = /\b(recurring|repeat|every|daily|weekly|monthly|chaque jour|chaque semaine|chaque mois)\b/i.test(text);
  if (!wantsRecurring) return null;
  return {
    enabled: true,
    intervalMinutes: parseRecurringIntervalMinutes(text, 24 * 60),
    maxRuns: parseRecurringMaxRuns(text, 20),
  };
}

function parseRecurringClockUtc(text: string) {
  const amPmMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*utc\b/i);
  if (amPmMatch) {
    const rawHour = Number(amPmMatch[1]);
    const rawMinute = amPmMatch[2] ? Number(amPmMatch[2]) : 0;
    if (Number.isFinite(rawHour) && rawHour >= 1 && rawHour <= 12 && Number.isFinite(rawMinute) && rawMinute >= 0 && rawMinute <= 59) {
      const suffix = String(amPmMatch[3] || "").toLowerCase();
      const byHour = suffix === "pm" ? (rawHour % 12) + 12 : rawHour % 12;
      return { byHour, byMinute: rawMinute };
    }
  }

  const twentyFourHourMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*utc\b/i);
  if (twentyFourHourMatch) {
    return {
      byHour: Number(twentyFourHourMatch[1]),
      byMinute: Number(twentyFourHourMatch[2]),
    };
  }

  return null as { byHour: number; byMinute: number } | null;
}

function parseHeuristicBackgroundControlIntent(text: string): ParsedAgentActionIntent | null {
  const mentionsBackground = /\b(background|autopilot|background engine|ops autopilot)\b/i.test(text);
  if (!mentionsBackground) return null;

  const wantsRecurring = /\b(recurring|repeat|every)\b/i.test(text) && /\b(meeting|sync|check[- ]?in|conversation)\b/i.test(text);
  if (wantsRecurring) {
    const disableRecurring = /\b(stop|disable|turn off|cancel)\b/i.test(text);
    const intervalMinutes = parseRecurringIntervalMinutes(text, 30);
    const clockUtc = parseRecurringClockUtc(text);
    const frequency = /\b(monthly|every month|chaque mois|mensuel)\b/i.test(text)
      ? "MONTHLY"
      : /\b(weekly|every week|chaque semaine|hebdomadaire)\b/i.test(text)
        ? "WEEKLY"
        : "DAILY";
    const intervalUnit = frequency === "MONTHLY" ? 30 * 24 * 60 : frequency === "WEEKLY" ? 7 * 24 * 60 : 24 * 60;
    const recurrenceInterval = Math.max(1, Math.floor(intervalMinutes / intervalUnit) || 1);
    const recurrenceRule = `${`FREQ=${frequency}`};INTERVAL=${recurrenceInterval}${
      clockUtc ? `;BYHOUR=${clockUtc.byHour};BYMINUTE=${clockUtc.byMinute}` : ""
    }`;
    const topicMatch = text.match(/\b(?:topic|focus)\s*[:=-]\s*([^\n]{3,140})/i);
    const topic = topicMatch?.[1] ? String(topicMatch[1]).trim() : null;

    return {
      actionType: "CONFIGURE_RECURRING_MEETING",
      payload: {
        enabled: !disableRecurring,
        intervalMinutes,
        topic,
        recurrenceRule,
        ...(clockUtc ? { byHour: clockUtc.byHour, byMinute: clockUtc.byMinute } : {}),
      },
      source: "heuristic",
    };
  }

  const wantsStart = /\b(start|run|launch|resume|enable)\b/i.test(text);
  if (!wantsStart) return null;
  const durationMinutes = parseDurationMinutes(text, 10);
  return {
    actionType: "START_BACKGROUND_SESSION",
    payload: {
      durationMinutes,
      visibility: "admin",
    },
    source: "heuristic",
  };
}

function dedupeIntents(intents: ParsedAgentActionIntent[]) {
  const seen = new Set<string>();
  return intents.filter((intent) => {
    const key = `${intent.actionType}:${JSON.stringify(intent.payload || {})}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractAgentActionIntents(
  text: string,
  options?: { allowHeuristics?: boolean },
): ParsedAgentActionIntent[] {
  const raw = String(text || "");
  if (!raw.trim()) return [];

  const intents: ParsedAgentActionIntent[] = [
    ...parseStructuredActionBlocks(raw),
    ...parseSingleBracketStructuredActionBlocks(raw),
  ];
  if (options?.allowHeuristics === false) return dedupeIntents(intents);

  const heuristicText = stripAgentActionMarkers(raw);
  if (!heuristicText) return dedupeIntents(intents);

  const existingTypes = new Set(intents.map((intent) => intent.actionType));

  if (!existingTypes.has("SEND_EMAIL")) {
    const emailIntent = parseHeuristicEmailIntent(heuristicText);
    if (emailIntent) intents.push(emailIntent);
  }

  if (!existingTypes.has("SEND_SMS")) {
    const smsIntent = parseHeuristicMessageIntent(heuristicText, "sms");
    if (smsIntent) intents.push(smsIntent);
  }

  if (!existingTypes.has("SEND_WHATSAPP")) {
    const whatsappIntent = parseHeuristicMessageIntent(heuristicText, "whatsapp");
    if (whatsappIntent) intents.push(whatsappIntent);
  }

  if (!existingTypes.has("CREATE_CONTACT")) {
    const contactIntent = parseHeuristicCreateContactIntent(heuristicText);
    if (contactIntent) intents.push(contactIntent);
  }

  if (!existingTypes.has("CREATE_AGENT") && !existingTypes.has("BULK_CREATE_AGENTS")) {
    const createAgentIntent = parseHeuristicCreateAgentIntent(heuristicText);
    if (createAgentIntent) intents.push(createAgentIntent);
  }

  if (!existingTypes.has("CREATE_SHOP")) {
    const shopIntent = parseHeuristicCreateShopIntent(heuristicText);
    if (shopIntent) intents.push(shopIntent);
  }

  if (!existingTypes.has("CREATE_TASK")) {
    const taskIntent = parseHeuristicCreateTaskIntent(heuristicText);
    if (taskIntent) intents.push(taskIntent);
  }

  if (!existingTypes.has("CREATE_MEETING_LINK") && !existingTypes.has("SEND_MEETING_INVITE") && !existingTypes.has("REQUEST_MEETING_SUMMARY")) {
    const meetingIntent = parseHeuristicMeetingIntent(heuristicText);
    if (meetingIntent) intents.push(meetingIntent);
  }

  if (!existingTypes.has("START_BACKGROUND_SESSION") && !existingTypes.has("CONFIGURE_RECURRING_MEETING")) {
    const backgroundControlIntent = parseHeuristicBackgroundControlIntent(heuristicText);
    if (backgroundControlIntent) intents.push(backgroundControlIntent);
  }

  return dedupeIntents(intents);
}

function resolveRequestedByAgentKey(input: DispatchAgentActionsInput) {
  const explicit = normalizeAgentKey(String(input.agent?.agentKey || ""));
  if (explicit) return explicit;
  const fromName = normalizeAgentKey(String(input.agent?.name || ""));
  if (fromName) return fromName;
  const fromRole = normalizeAgentKey(String(input.agent?.role || ""));
  if (fromRole) return fromRole;
  const fromEnv = normalizeAgentKey(String(process.env.MAIL_DEFAULT_AGENT_KEY || ""));
  if (fromEnv) return fromEnv;
  return "support";
}

function buildIdempotencyKey(args: {
  tenantId: number;
  conversationId: string;
  actionType: DispatchableActionType;
  payload: Record<string, unknown>;
  correlationId: string;
}) {
  const fingerprint = JSON.stringify({
    tenantId: args.tenantId,
    conversationId: args.conversationId,
    actionType: args.actionType,
    payload: args.payload,
    correlationId: args.correlationId,
  });
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 64);
}

function shouldUseCurrentUserFallbackRecipient(rawText: string) {
  const normalized = String(rawText || "").toLowerCase();
  return /\b(current user|platform admin|admin user|send (it )?to me|send me)\b/i.test(normalized);
}

function ensureEmailPayload(
  payload: Record<string, unknown>,
  fallbackBody: string,
  agentKey: string,
  opts?: { fallbackRecipients?: string[] | null; rawText?: string | null },
) {
  let to = asStringArray(payload.to);
  if (!to.length) {
    const fallbackRecipients = asStringArray(opts?.fallbackRecipients);
    if (fallbackRecipients.length && shouldUseCurrentUserFallbackRecipient(String(opts?.rawText || fallbackBody || ""))) {
      to = fallbackRecipients;
    }
  }
  const subject = typeof payload.subject === "string" && payload.subject.trim() ? payload.subject.trim() : "Action requested from conversation";
  let textBody = fallbackBody;
  if (payload.body && typeof payload.body === "object" && !Array.isArray(payload.body)) {
    const bodyText = (payload.body as Record<string, unknown>).text;
    if (typeof bodyText === "string" && bodyText.trim()) textBody = bodyText.trim();
  } else if (typeof payload.body === "string" && payload.body.trim()) {
    textBody = payload.body.trim();
  }

  textBody = stripAgentActionMarkers(textBody) || textBody;

  return {
    valid: to.length > 0,
    payload: {
      agentKey,
      to,
      subject,
      body: { text: textBody },
    },
  };
}

function ensureMessagePayload(payload: Record<string, unknown>, fallbackBody: string, agentKey: string) {
  const toE164 = typeof payload.toE164 === "string" ? payload.toE164.trim() : typeof payload.to === "string" ? payload.to.trim() : "";
  const bodyRaw = typeof payload.body === "string" && payload.body.trim() ? payload.body.trim() : fallbackBody;
  const body = stripAgentActionMarkers(bodyRaw) || bodyRaw;
  const mode = typeof payload.mode === "string" && payload.mode.trim() ? payload.mode.trim() : "text";
  return {
    valid: Boolean(toE164),
    payload: {
      agentKey,
      toE164,
      body,
      mode,
    },
  };
}

type StructuredPayloadNormalization = {
  valid: boolean;
  payload: Record<string, unknown>;
  blockedReason: string;
  dispatchActionType?: DispatchableActionType;
};

function ensureStructuredActionPayload(
  actionType: DispatchableActionType,
  payload: Record<string, unknown>,
  fallbackBody: string,
): StructuredPayloadNormalization {
  if (actionType === "CREATE_CONTACT") {
    const displayName = firstNonEmptyString(payload.displayName, payload.name, payload.fullName, payload.contactName);
    const company = firstNonEmptyString(payload.company, payload.companyName);
    const jobTitle = firstNonEmptyString(payload.jobTitle, payload.role, payload.title);
    const notes = firstNonEmptyString(payload.notes, payload.note);
    const emails = uniqueStrings([
      ...asStringArray(payload.emails),
      ...asStringArray(payload.email),
      ...asStringArray(payload.primaryEmail),
    ]);
    const phones = uniqueStrings([
      ...asStringArray(payload.phones),
      ...asStringArray(payload.phone),
      ...asStringArray(payload.phoneNumber),
      ...asStringArray(payload.whatsapp),
    ]);
    const recurring = extractRecurringPayload(payload);
    return {
      valid: Boolean(displayName || emails.length || phones.length),
      payload: {
        displayName,
        company,
        jobTitle,
        emails,
        phones,
        notes,
        ...(recurring ? { recurring } : {}),
      },
      blockedReason: "Action blocked: CREATE_CONTACT requires at least a name, email, or phone.",
    };
  }

  if (actionType === "CREATE_AGENT") {
    const name = firstNonEmptyString(payload.name, payload.displayName, payload.agentName);
    const role = firstNonEmptyString(payload.role, payload.title, payload.agentRole) || "Agent";
    const department = firstNonEmptyString(payload.department, payload.team, payload.unit);
    const runtimeModel = firstNonEmptyString(payload.runtimeModel, payload.runtime_model, payload.model);
    const toolsEnabled = Array.isArray(payload.toolsEnabled)
      ? uniqueStrings((payload.toolsEnabled as unknown[]).map((item) => String(item || "")))
      : [];
    const status = firstNonEmptyString(payload.status, payload.agentStatus, payload.agent_status);
    const names = uniqueStrings([name || "", ...extractAgentNamesFromPayload(payload)]);
    const requestedCount = resolveAgentRequestCount(payload, fallbackBody, names.length > 1 ? names.length : 1);

    if (requestedCount > 1) {
      const agents = buildBulkAgentEntries({
        count: requestedCount,
        names,
        baseName: name || firstNonEmptyString(payload.baseName, payload.base_name, "Agent"),
        role,
        department,
        runtimeModel,
        toolsEnabled,
        status,
      });
      return {
        valid: agents.length > 0,
        payload: { agents },
        dispatchActionType: "BULK_CREATE_AGENTS",
        blockedReason: "Action blocked: CREATE_AGENT requires at least one valid entry.",
      };
    }

    return {
      valid: Boolean(name),
      payload: {
        name,
        role,
        department,
        runtimeModel,
        toolsEnabled,
        status,
      },
      blockedReason: "Action blocked: CREATE_AGENT requires a name.",
    };
  }

  if (actionType === "BULK_CREATE_AGENTS") {
    const entriesRaw = Array.isArray(payload.agents) ? payload.agents : [];
    const entriesFromList = entriesRaw
      .map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null))
      .filter(Boolean)
      .map((entry) => ({
        name: firstNonEmptyString(entry!.name, entry!.displayName, entry!.agentName),
        role: firstNonEmptyString(entry!.role, entry!.title, entry!.agentRole) || "Agent",
        department: firstNonEmptyString(entry!.department, entry!.team, entry!.unit),
        runtimeModel: firstNonEmptyString(entry!.runtimeModel, entry!.runtime_model, entry!.model),
        toolsEnabled: Array.isArray(entry!.toolsEnabled)
          ? uniqueStrings((entry!.toolsEnabled as unknown[]).map((item) => String(item || "")))
          : [],
        status: firstNonEmptyString(entry!.status, entry!.agentStatus, entry!.agent_status),
      }))
      .filter((entry) => Boolean(entry.name))
      .slice(0, 100);

    const template =
      payload.template && typeof payload.template === "object" && !Array.isArray(payload.template)
        ? (payload.template as Record<string, unknown>)
        : {};
    const templateName = firstNonEmptyString(
      payload.baseName,
      payload.base_name,
      payload.name,
      template.name,
      template.displayName,
      template.agentName,
      "Agent",
    );
    const templateRole = firstNonEmptyString(payload.role, payload.title, template.role, template.title, "Agent") || "Agent";
    const templateDepartment = firstNonEmptyString(payload.department, payload.team, template.department, template.team);
    const templateRuntimeModel = firstNonEmptyString(
      payload.runtimeModel,
      payload.runtime_model,
      payload.model,
      template.runtimeModel,
      template.runtime_model,
      template.model,
    );
    const templateToolsEnabled = uniqueStrings([
      ...asStringArray(payload.toolsEnabled),
      ...asStringArray(payload.tools_enabled),
      ...asStringArray(template.toolsEnabled),
      ...asStringArray(template.tools_enabled),
    ]);
    const templateStatus = firstNonEmptyString(payload.status, template.status, payload.agentStatus, payload.agent_status);
    const names = extractAgentNamesFromPayload(payload);
    const requestedCount = resolveAgentRequestCount(payload, fallbackBody, Math.max(entriesFromList.length, names.length, 1));

    const entries =
      entriesFromList.length > 0
        ? entriesFromList
        : buildBulkAgentEntries({
            count: requestedCount,
            names,
            baseName: templateName,
            role: templateRole,
            department: templateDepartment,
            runtimeModel: templateRuntimeModel,
            toolsEnabled: templateToolsEnabled,
            status: templateStatus,
          });

    return {
      valid: entries.length > 0,
      payload: { agents: entries },
      blockedReason: "Action blocked: BULK_CREATE_AGENTS requires a non-empty agents[] list.",
    };
  }

  if (actionType === "UPDATE_AGENT_MODEL") {
    const agentId = parseOptionalNumber(payload.agentId ?? payload.agent_id);
    const runtimeModel = firstNonEmptyString(payload.runtimeModel, payload.runtime_model, payload.model);
    return {
      valid: Boolean(agentId && runtimeModel),
      payload: { agentId, runtimeModel },
      blockedReason: "Action blocked: UPDATE_AGENT_MODEL requires agentId + runtimeModel.",
    };
  }

  if (actionType === "ASSIGN_AGENT_TO_CONVERSATION") {
    const agentId = parseOptionalNumber(payload.agentId ?? payload.agent_id);
    const conversationId = firstNonEmptyString(payload.conversationId, payload.conversation_id, payload.threadId, payload.thread_id);
    return {
      valid: Boolean(agentId && conversationId),
      payload: { agentId, conversationId },
      blockedReason: "Action blocked: ASSIGN_AGENT_TO_CONVERSATION requires agentId + conversationId.",
    };
  }

  if (actionType === "CREATE_SHOP") {
    const shopName = firstNonEmptyString(payload.shopName, payload.shop_name, payload.name);
    const description = firstNonEmptyString(payload.description, payload.notes, payload.note);
    const email = firstNonEmptyString(payload.email, payload.ownerEmail, payload.owner_email);
    const phoneNumber = firstNonEmptyString(payload.phoneNumber, payload.phone, payload.ownerPhone, payload.owner_phone, payload.whatsapp);
    const legalEntity = firstNonEmptyString(
      payload.legalEntity,
      payload.legal_entity,
      payload.businessRegistration,
      payload.business_registration,
    );
    const taxId = firstNonEmptyString(payload.taxId, payload.tax_id, payload.personalId, payload.personal_id);
    const ownerContactIdRaw = firstNonEmptyString(payload.ownerContactId, payload.owner_contact_id);
    const ownerUserIdRaw = firstNonEmptyString(payload.ownerUserId, payload.owner_user_id, payload.userId, payload.user_id);
    const ownerContactId =
      ownerContactIdRaw && Number.isFinite(Number(ownerContactIdRaw)) ? Math.trunc(Number(ownerContactIdRaw)) : null;
    const ownerUserId = ownerUserIdRaw && Number.isFinite(Number(ownerUserIdRaw)) ? Math.trunc(Number(ownerUserIdRaw)) : null;
    const ownerContactRef = ownerContactId == null && ownerContactIdRaw ? ownerContactIdRaw : null;
    const ownerUserRef = ownerUserId == null && ownerUserIdRaw ? ownerUserIdRaw : null;
    const sellerTypeRaw = firstNonEmptyString(payload.sellerType, payload.seller_type);
    const productionType = firstNonEmptyString(payload.productionType, payload.production_type);
    const recurring = extractRecurringPayload(payload);
    return {
      valid: Boolean(shopName),
      payload: {
        shopName,
        description,
        email,
        phoneNumber,
        legalEntity,
        taxId,
        ownerContactId,
        ownerContactRef,
        ownerUserId,
        ownerUserRef,
        sellerType: sellerTypeRaw ? sellerTypeRaw.toLowerCase() : null,
        productionType: productionType ? productionType.toLowerCase() : null,
        ...(recurring ? { recurring } : {}),
      },
      blockedReason: "Action blocked: CREATE_SHOP requires shopName.",
    };
  }

  if (actionType === "CREATE_TASK") {
    const title = firstNonEmptyString(payload.title, payload.taskTitle, payload.task, payload.name);
    const description = firstNonEmptyString(payload.description, payload.body, payload.notes, payload.note);
    const dueDateRaw = firstNonEmptyString(payload.dueDate, payload.due_date, payload.deadline);
    const dueDate =
      dueDateRaw && /^\d{4}-\d{2}-\d{2}/.test(dueDateRaw)
        ? dueDateRaw
        : dueDateRaw && !Number.isNaN(Date.parse(dueDateRaw))
          ? new Date(dueDateRaw).toISOString()
          : null;
    const priority = firstNonEmptyString(payload.priority, payload.level, payload.urgency)?.toLowerCase() || "medium";
    const status = firstNonEmptyString(payload.status)?.toLowerCase() || "backlog";
    const goalId = parseOptionalNumber(payload.goalId ?? payload.goal_id);
    const agentId = parseOptionalNumber(payload.agentId ?? payload.agent_id ?? payload.assigneeId ?? payload.assignee_id);
    const recurring = extractRecurringPayload(payload);

    return {
      valid: Boolean(title),
      payload: {
        title,
        description: description || title,
        dueDate,
        priority,
        status,
        goalId,
        agentId,
        ...(recurring ? { recurring } : {}),
      },
      blockedReason: "Action blocked: CREATE_TASK requires title.",
    };
  }

  if (actionType === "CREATE_MEETING_LINK") {
    const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Meeting";
    return {
      valid: Boolean(title),
      payload: {
        title,
        startsAt: typeof payload.startsAt === "string" ? payload.startsAt : undefined,
        recordingEnabled: Boolean(payload.recordingEnabled ?? false),
      },
      blockedReason: "Action blocked: CREATE_MEETING_LINK requires a meeting title.",
    };
  }

  if (actionType === "SEND_MEETING_INVITE") {
    const meetingId = typeof payload.meetingId === "string" ? payload.meetingId.trim() : "";
    const recipients = asStringArray(payload.recipients);
    return {
      valid: Boolean(meetingId && recipients.length > 0),
      payload: {
        meetingId,
        recipients,
        role: typeof payload.role === "string" && payload.role.trim() ? payload.role.trim().toLowerCase() : "attendee",
      },
      blockedReason: "Action blocked: SEND_MEETING_INVITE requires meetingId + recipients[].",
    };
  }

  if (actionType === "REQUEST_MEETING_SUMMARY") {
    const meetingId = typeof payload.meetingId === "string" ? payload.meetingId.trim() : "";
    const inferred = fallbackBody.match(/\b([a-f0-9]{8}-[a-f0-9-]{27,36}|[a-z0-9-]{10,64})\b/i)?.[1] || "";
    const resolvedMeetingId = meetingId || inferred;
    return {
      valid: Boolean(resolvedMeetingId),
      payload: {
        meetingId: resolvedMeetingId,
      },
      blockedReason: "Action blocked: REQUEST_MEETING_SUMMARY requires meetingId.",
    };
  }

  if (actionType === "START_BACKGROUND_SESSION") {
    const rawDuration = Number(payload.durationMinutes ?? payload.duration_minutes ?? 10);
    const durationMinutes = Number.isFinite(rawDuration) ? Math.min(24 * 60, Math.max(1, Math.trunc(rawDuration))) : 10;
    const visibilityRaw = String(payload.visibility ?? "admin").trim().toLowerCase();
    const visibility = visibilityRaw === "public" || visibilityRaw === "internal" ? visibilityRaw : "admin";
    return {
      valid: true,
      payload: {
        durationMinutes,
        visibility,
      },
      blockedReason: "Action blocked: START_BACKGROUND_SESSION requires durationMinutes > 0.",
    };
  }

  if (actionType === "CONFIGURE_RECURRING_MEETING") {
    const enabled =
      typeof payload.enabled === "boolean"
        ? payload.enabled
        : String(payload.enabled ?? "true").trim().toLowerCase() !== "false";
    const rawInterval = Number(payload.intervalMinutes ?? payload.interval_minutes ?? payload.everyMinutes ?? 30);
    const intervalMinutes = Number.isFinite(rawInterval) ? Math.min(24 * 60, Math.max(1, Math.trunc(rawInterval))) : 30;
    const topic = typeof payload.topic === "string" && payload.topic.trim() ? payload.topic.trim() : null;
    return {
      valid: true,
      payload: {
        enabled,
        intervalMinutes,
        topic,
      },
      blockedReason: "Action blocked: CONFIGURE_RECURRING_MEETING requires intervalMinutes > 0.",
    };
  }

  return {
    valid: false,
    payload: {},
    blockedReason: `Action blocked: unsupported action type ${actionType}.`,
  };
}

async function defaultCreateActionRequest(input: CreateActionRequestInput): Promise<CreateActionRequestResult> {
  const mod = await import("./ActionRouter");
  const row = await mod.createActionRequest(input as any);
  return {
    id: Number((row as any)?.id),
    status: String((row as any)?.status || ""),
    state: String((row as any)?.state || (row as any)?.lifecycleState || "").trim() || null,
    lifecycleState: String((row as any)?.lifecycleState || "").trim() || null,
    publicActionId: String((row as any)?.publicActionId || "").trim() || null,
    public_action_id: String((row as any)?.public_action_id || "").trim() || null,
  };
}

export async function dispatchAgentActionIntents(
  input: DispatchAgentActionsInput,
  deps?: { createActionRequest?: CreateActionRequestFn },
): Promise<DispatchAgentActionsResult> {
  const intents = extractAgentActionIntents(input.text, {
    allowHeuristics: input.allowHeuristics !== false,
  });
  const created: DispatchCreatedAction[] = [];
  const blocked: string[] = [];
  const createActionRequest = deps?.createActionRequest || defaultCreateActionRequest;

  const tenantId = Number(input.tenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    if (intents.length > 0) blocked.push("Action blocked: tenant context missing.");
    return { intentsDetected: intents.length, created, blocked };
  }

  const requestedByAgentKey = resolveRequestedByAgentKey(input);
  const fallbackBody = String(input.text || "").trim();

  for (let index = 0; index < intents.length; index += 1) {
    const intent = intents[index];
    const correlationId = [
      "act",
      input.conversationId || "conversation",
      input.agent?.id ? `agent-${input.agent.id}` : "agent-unknown",
      Date.now(),
      index,
    ].join(":");

    let normalizedPayload: Record<string, unknown> = {};
    let payloadValid = false;
    let actionTypeToDispatch: DispatchableActionType = intent.actionType;
    if (intent.actionType === "SEND_EMAIL") {
      const normalized = ensureEmailPayload(intent.payload, fallbackBody, requestedByAgentKey, {
        fallbackRecipients: input.fallbackRecipientEmails,
        rawText: input.text,
      });
      normalizedPayload = normalized.payload;
      payloadValid = normalized.valid;
      if (!payloadValid) {
        blocked.push("Action blocked: SEND_EMAIL requires at least one recipient email.");
        continue;
      }
    } else if (intent.actionType === "SEND_SMS" || intent.actionType === "SEND_WHATSAPP") {
      const normalized = ensureMessagePayload(intent.payload, fallbackBody, requestedByAgentKey);
      normalizedPayload = normalized.payload;
      payloadValid = normalized.valid;
      if (!payloadValid) {
        blocked.push(`Action blocked: ${intent.actionType} requires a destination phone number.`);
        continue;
      }
    } else {
      const normalized = ensureStructuredActionPayload(intent.actionType, intent.payload, fallbackBody);
      normalizedPayload = normalized.payload;
      payloadValid = normalized.valid;
      actionTypeToDispatch = normalized.dispatchActionType ?? intent.actionType;
      if (!payloadValid) {
        blocked.push(normalized.blockedReason);
        continue;
      }
    }

    const payload = {
      ...normalizedPayload,
      source: input.source,
      conversationId: input.conversationId,
      channelId: input.channelId ?? null,
      companyId: input.companyId ?? null,
      sourceMeetingId: input.meetingId ?? null,
      sourceMessageId: input.messageId ?? null,
      correlationId,
      agentId: input.agent?.id ?? null,
    } as Record<string, unknown>;

    const idempotencyKey = buildIdempotencyKey({
      tenantId,
      conversationId: input.conversationId,
      actionType: actionTypeToDispatch,
      payload,
      correlationId,
    });

    try {
      const row = await createActionRequest({
        tenantId,
        requestedByUserId: input.requestedByUserId ?? null,
        requestedByAgentKey,
        actionType: actionTypeToDispatch,
        payload,
        priority: 8,
        idempotencyKey,
        relatedConversationId: input.conversationId,
        relatedThreadId: null,
        isAdmin: Boolean(input.isAdmin),
      });

      created.push({
        id: Number(row.id),
        status: String(row.status || ""),
        state: String((row as any).state || (row as any).lifecycleState || "").trim() || null,
        publicActionId:
          String((row as any).publicActionId || (row as any).public_action_id || "").trim() || null,
        actionType: actionTypeToDispatch,
        targetCount:
          actionTypeToDispatch === "BULK_CREATE_AGENTS"
            ? Math.max(
                0,
                Math.min(100, Array.isArray((payload as any)?.agents) ? Number((payload as any).agents.length) : 0),
              )
            : null,
        correlationId,
      });

      console.log(
        `[actions-dispatch] created actionId=${row.id} type=${actionTypeToDispatch} correlationId=${correlationId} tenantId=${tenantId} conversationId=${input.conversationId} agentId=${input.agent?.id ?? "n/a"}`,
      );
    } catch (error: any) {
      const message = String(error?.message || error || "unknown_error");
      blocked.push(`Action blocked (${actionTypeToDispatch}): ${message}`);
      console.error(
        `[actions-dispatch] failed type=${actionTypeToDispatch} correlationId=${correlationId} tenantId=${tenantId} conversationId=${input.conversationId}: ${message}`,
      );
    }
  }

  return { intentsDetected: intents.length, created, blocked };
}

export function stripAgentActionMarkers(text: string) {
  const raw = String(text || "");
  const withoutBlocks = stripAllActionBlocks(raw);

  const lines = withoutBlocks.split(/\r?\n/);
  const out: string[] = [];

  let skippingPayload = false;
  let inFence = false;

  const looksLikeJsonPayloadLine = (line: string) => {
    const t = line.trim();
    if (!t) return true;
    if (t.startsWith("{") || t.startsWith("}") || t.startsWith("[") || t.startsWith("]")) return true;
    if (t.startsWith("\"") || t.startsWith("',") || t.startsWith("\",")) return true;
    if (/^["']?[a-zA-Z0-9_]+\s*:\s*/.test(t)) return true;
    if (t.includes("\"to\"") || t.includes("\"subject\"") || t.includes("\"body\"")) return true;
    return false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (inFence) {
      if (trimmed.startsWith("```")) {
        inFence = false;
        skippingPayload = false;
      }
      continue;
    }

    if (ACTION_MARKER_LINE_TEST.test(line)) {
      skippingPayload = true;
      continue;
    }

    if (skippingPayload) {
      if (trimmed.startsWith("```")) {
        inFence = true;
        continue;
      }
      if (looksLikeJsonPayloadLine(line)) continue;
      skippingPayload = false;
    }

    out.push(line);
  }

  const withoutLines = out.join("\n").replace(ACTION_MARKER_LINE_REGEX, " ");
  return withoutLines.replace(/\n{3,}/g, "\n\n").trim();
}

export function renderActionDispatchFeedback(result: DispatchAgentActionsResult) {
  const actionLabel = (created: DispatchCreatedAction) =>
    String(created.publicActionId || "").trim() || `ACT-${String(created.id || 0).padStart(6, "0")}`;

  const lines: string[] = [];
  for (const created of result.created) {
    const status = String(created.status || "").toUpperCase();
    const state = String(created.state || "").toUpperCase();
    const label = actionLabel(created);

    if (status === "SIMULATED") {
      lines.push(`SIMULATED - NO SIDE EFFECT (${label}).`);
      continue;
    }

    if (state === "FAILED" || status === "FAILED") {
      lines.push(`Action failed immediately (${label}).`);
      continue;
    }

    if (created.actionType === "SEND_EMAIL") {
      if (status === "REQUIRES_APPROVAL") {
        lines.push(`Email prepared and awaiting approval (${label}).`);
      } else {
        lines.push(`Email queued with delivery tracking (${label}).`);
      }
      continue;
    }

    if (created.actionType === "CREATE_MEETING_LINK") {
      lines.push(`Meeting link is being created (${label}).`);
      continue;
    }

    if (created.actionType === "CREATE_CONTACT") {
      lines.push(`Contact save is queued (${label}).`);
      continue;
    }

    if (created.actionType === "CREATE_AGENT") {
      lines.push(`Agent creation is queued (${label}).`);
      continue;
    }

    if (created.actionType === "BULK_CREATE_AGENTS") {
      const count = Number.isFinite(Number(created.targetCount)) ? Math.max(0, Number(created.targetCount)) : 0;
      if (count > 0) {
        lines.push(`Bulk agent creation is queued (${label}) for ${count} agents.`);
      } else {
        lines.push(`Bulk agent creation is queued (${label}).`);
      }
      continue;
    }

    if (created.actionType === "UPDATE_AGENT_MODEL") {
      lines.push(`Agent model update is queued (${label}).`);
      continue;
    }

    if (created.actionType === "ASSIGN_AGENT_TO_CONVERSATION") {
      lines.push(`Agent conversation assignment is queued (${label}).`);
      continue;
    }

    if (created.actionType === "CREATE_SHOP") {
      lines.push(`Shop creation is queued (${label}).`);
      continue;
    }

    if (created.actionType === "CREATE_TASK") {
      lines.push(`Task creation is queued (${label}).`);
      continue;
    }

    if (created.actionType === "SEND_MEETING_INVITE") {
      lines.push(`Meeting invite is being sent (${label}).`);
      continue;
    }

    if (created.actionType === "START_BACKGROUND_SESSION") {
      if (status === "REQUIRES_APPROVAL") {
        lines.push(`Background run request awaits chairman approval (${label}).`);
      } else {
        lines.push(`Background run queued (${label}).`);
      }
      continue;
    }

    if (created.actionType === "CONFIGURE_RECURRING_MEETING") {
      if (status === "REQUIRES_APPROVAL") {
        lines.push(`Recurring meeting config awaits chairman approval (${label}).`);
      } else {
        lines.push(`Recurring meeting config queued (${label}).`);
      }
      continue;
    }

    const actionName = created.actionType.replace(/_/g, " ").toLowerCase();
    const human = actionName.slice(0, 1).toUpperCase() + actionName.slice(1);
    lines.push(`${human} is queued (${actionLabel(created)}).`);
  }
  for (const blocked of result.blocked) {
    lines.push(`Could not proceed: ${blocked}`);
  }
  return lines.join("\n");
}
