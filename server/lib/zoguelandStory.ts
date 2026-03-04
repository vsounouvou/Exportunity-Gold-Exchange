export type StoryLength = "short" | "medium" | "long";

export type StoryRequest = {
  character: string;
  world: string;
  mission: string;
  tone?: string;
  length?: StoryLength;
};

const BANNED_TERMS = [
  "kill",
  "murder",
  "blood",
  "weapon",
  "gun",
  "knife",
  "suicide",
  "terror",
  "drugs",
  "sex",
  "nude",
  "hate",
  "abuse",
] as const;

function normalizeValue(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsUnsafeTerms(value: string) {
  const lowered = value.toLowerCase();
  return BANNED_TERMS.some((term) => lowered.includes(term));
}

function sanitizeStoryField(value: unknown, maxLength: number) {
  return normalizeValue(value)
    .replace(/[<>]/g, "")
    .slice(0, maxLength);
}

function safeTone(value: string) {
  const normalized = value.toLowerCase();
  if (containsUnsafeTerms(normalized)) return "gentle";
  return normalized || "curious";
}

function sentenceCountForLength(length: StoryLength) {
  if (length === "short") return 4;
  if (length === "long") return 10;
  return 7;
}

function buildStoryBody(input: {
  character: string;
  world: string;
  mission: string;
  tone: string;
  length: StoryLength;
}) {
  const sentenceTarget = sentenceCountForLength(input.length);
  const opening = `${input.character} arrived in ${input.world} with a ${input.tone} heart and bright eyes.`;
  const setup = `A small guide explained the mission: ${input.mission}.`;
  const progress = [
    `${input.character} listened carefully, made a plan, and invited friends to help.`,
    `Together they solved one challenge at a time by asking questions and sharing ideas.`,
    `When the path became confusing, they paused, breathed, and tried a new approach.`,
    `Kindness and teamwork turned every obstacle into a lesson.`,
    `By sunset, the mission was complete and everyone celebrated with gratitude.`,
    `${input.character} wrote the adventure in a journal so others could learn from it.`,
    `The next day, ${input.world} felt brighter because courage had become contagious.`,
    `Everyone promised to keep building, helping, and exploring safely.`,
  ];

  const selected = progress.slice(0, Math.max(0, sentenceTarget - 3));
  const closing = `${input.character} smiled and said, \"Every big dream starts with one brave step.\"`;

  return [opening, setup, ...selected, closing].join(" ");
}

export function buildZoguelandStory(payload: StoryRequest) {
  const character = sanitizeStoryField(payload.character, 60);
  const world = sanitizeStoryField(payload.world, 80);
  const mission = sanitizeStoryField(payload.mission, 120);
  const tone = safeTone(sanitizeStoryField(payload.tone, 32));
  const length = (payload.length === "short" || payload.length === "long" || payload.length === "medium"
    ? payload.length
    : "medium") as StoryLength;

  if (!character || !world || !mission) {
    return {
      ok: false as const,
      code: "MISSING_FIELDS",
      message: "character, world, and mission are required",
    };
  }

  const combined = `${character} ${world} ${mission} ${tone}`;
  if (containsUnsafeTerms(combined)) {
    return {
      ok: false as const,
      code: "UNSAFE_INPUT",
      message: "Story request contains unsafe language for children.",
    };
  }

  const title = `${character} in ${world}`;
  const story = buildStoryBody({ character, world, mission, tone, length });
  const estimatedTokens = Math.max(80, Math.ceil(story.split(/\s+/).length * 1.35));

  return {
    ok: true as const,
    title,
    story,
    safetyLabel: "child-safe",
    tokenUsage: {
      estimatedTokens,
      model: "template-safe-v1",
    },
  };
}
