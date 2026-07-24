export const AGOOJIYE_SEQUENCE_MAX_STEPS = 5;
export const AGOOJIYE_SEQUENCE_MAX_DAILY_SENDS = 20;
export const AGOOJIYE_SEQUENCE_MIN_DELAY_HOURS = 24;

type SequencePolicyInput = {
  templateIds: number[];
  maxSteps: number;
  minDelayHours: number;
  dailyLimit: number;
};

function integer(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function parseBusinessHours(value: unknown) {
  const match = String(value ?? "").match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
  const startHour = Math.min(23, Math.max(0, integer(match?.[1], 8)));
  const startMinute = Math.min(59, Math.max(0, integer(match?.[2], 0)));
  const endHour = Math.min(23, Math.max(0, integer(match?.[3], 17)));
  const endMinute = Math.min(59, Math.max(0, integer(match?.[4], 0)));
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return end > start ? { start, end } : { start: 8 * 60, end: 17 * 60 };
}

export function validateAgoojiyeSequencePolicy(input: SequencePolicyInput) {
  const templateIds = Array.from(
    new Set((Array.isArray(input.templateIds) ? input.templateIds : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  );
  const maxSteps = integer(input.maxSteps);
  const minDelayHours = integer(input.minDelayHours);
  const dailyLimit = integer(input.dailyLimit);
  const errors: string[] = [];

  if (!templateIds.length) errors.push("Ajoutez au moins un modele approuve.");
  if (maxSteps < 1 || maxSteps > AGOOJIYE_SEQUENCE_MAX_STEPS) {
    errors.push(`Le nombre d'etapes doit etre compris entre 1 et ${AGOOJIYE_SEQUENCE_MAX_STEPS}.`);
  }
  if (templateIds.length > Math.min(Math.max(maxSteps, 1), AGOOJIYE_SEQUENCE_MAX_STEPS)) {
    errors.push("Le nombre de modeles depasse le nombre maximal d'etapes.");
  }
  if (minDelayHours < AGOOJIYE_SEQUENCE_MIN_DELAY_HOURS) {
    errors.push(`Le delai minimal entre deux messages est de ${AGOOJIYE_SEQUENCE_MIN_DELAY_HOURS} heures.`);
  }
  if (dailyLimit < 1 || dailyLimit > AGOOJIYE_SEQUENCE_MAX_DAILY_SENDS) {
    errors.push(`La limite quotidienne doit etre comprise entre 1 et ${AGOOJIYE_SEQUENCE_MAX_DAILY_SENDS}.`);
  }

  return { valid: errors.length === 0, errors, templateIds, maxSteps, minDelayHours, dailyLimit };
}

// Benin remains UTC+1 year-round. Keeping the calculation explicit avoids a heavy date dependency in the worker.
export function nextAgoojiyeSequenceRun(input: {
  from: Date;
  minDelayHours: number;
  businessHours?: string | null;
}) {
  const hours = parseBusinessHours(input.businessHours);
  const minimumDelay = Math.max(AGOOJIYE_SEQUENCE_MIN_DELAY_HOURS, integer(input.minDelayHours, AGOOJIYE_SEQUENCE_MIN_DELAY_HOURS));
  let local = new Date(input.from.getTime() + minimumDelay * 60 * 60 * 1_000 + 60 * 60 * 1_000);

  for (let guard = 0; guard < 10; guard += 1) {
    const day = local.getUTCDay();
    if (day === 0 || day === 6) {
      const daysToMonday = day === 6 ? 2 : 1;
      local.setUTCDate(local.getUTCDate() + daysToMonday);
      local.setUTCHours(Math.floor(hours.start / 60), hours.start % 60, 0, 0);
      continue;
    }

    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (minutes < hours.start) {
      local.setUTCHours(Math.floor(hours.start / 60), hours.start % 60, 0, 0);
      break;
    }
    if (minutes >= hours.end) {
      local.setUTCDate(local.getUTCDate() + 1);
      local.setUTCHours(Math.floor(hours.start / 60), hours.start % 60, 0, 0);
      continue;
    }
    break;
  }

  return new Date(local.getTime() - 60 * 60 * 1_000);
}

export function agoojiyeBeninDayStart(date: Date) {
  const local = new Date(date.getTime() + 60 * 60 * 1_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - 60 * 60 * 1_000);
}

export function renderAgoojiyeSequenceTemplate(template: string, variables: Record<string, unknown>) {
  return String(template ?? "").replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = String(variables[key] ?? "").trim();
    return value || `[A COMPLETER: ${key}]`;
  });
}
