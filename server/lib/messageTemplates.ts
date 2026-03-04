import { db } from "@db";
import { messageTemplates } from "@db/schema";
import { eq } from "drizzle-orm";

function schemaNotReady(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /relation .*message_templates.* does not exist|does not exist/i.test(msg);
}

const DEFAULT_TEMPLATES = [
  {
    category: "onboarding",
    language: "fr",
    templateText: "Bienvenue. Dites-moi votre besoin: prix, KYC, rendez-vous, ou commande.",
    tags: ["onboarding"],
    intents: ["help", "onboarding"],
  },
  {
    category: "onboarding",
    language: "en",
    templateText: "Welcome. Tell me what you need: pricing, KYC, scheduling, or an order.",
    tags: ["onboarding"],
    intents: ["help", "onboarding"],
  },
  {
    category: "pricing",
    language: "fr",
    templateText: "Pour un prix, précisez: type, pureté, quantité, pays/ville, et délai.",
    tags: ["pricing"],
    intents: ["pricing"],
  },
  {
    category: "pricing",
    language: "en",
    templateText: "For pricing, share: type, purity, quantity, country/city, and timeline.",
    tags: ["pricing"],
    intents: ["pricing"],
  },
  {
    category: "kyc",
    language: "fr",
    templateText:
      "Checklist KYC:\n1) Pièce d'identité\n2) Preuve d'adresse\n3) Source des fonds\n4) Documents société (si applicable)\n5) Pays + contact",
    tags: ["kyc"],
    intents: ["kyc"],
  },
  {
    category: "kyc",
    language: "en",
    templateText:
      "KYC checklist:\n1) Government ID\n2) Proof of address\n3) Source of funds\n4) Company docs (if applicable)\n5) Country + contact",
    tags: ["kyc"],
    intents: ["kyc"],
  },
  {
    category: "scheduling",
    language: "fr",
    templateText: "Proposez 2 créneaux + votre fuseau horaire. Nous confirmons par retour.",
    tags: ["scheduling"],
    intents: ["schedule"],
  },
  {
    category: "scheduling",
    language: "en",
    templateText: "Share 2 time slots + your timezone. We'll confirm by reply.",
    tags: ["scheduling"],
    intents: ["schedule"],
  },
  {
    category: "objections",
    language: "fr",
    templateText:
      "Compris. Pour avancer: 1) quantité + pureté 2) pays/ville 3) documents disponibles. Je vous envoie les étapes ensuite.",
    tags: ["objection"],
    intents: ["objection"],
  },
  {
    category: "objections",
    language: "en",
    templateText:
      "Understood. To proceed: 1) quantity + purity 2) country/city 3) available documents. Then I'll send next steps.",
    tags: ["objection"],
    intents: ["objection"],
  },
] as const;

export async function ensureDefaultMessageTemplates() {
  try {
    const existing = await db.query.messageTemplates.findFirst({
      where: eq(messageTemplates.isActive, true),
      columns: { id: true },
    });
    if (existing) return;

    const now = new Date();
    await db
      .insert(messageTemplates)
      .values(
        DEFAULT_TEMPLATES.map((t) => ({
          tenantId: null,
          category: t.category,
          language: t.language,
          templateText: t.templateText,
          tags: [...t.tags],
          intents: [...t.intents],
          isActive: true,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .onConflictDoNothing();
  } catch (error) {
    if (schemaNotReady(error)) return;
    console.warn("[message_templates] seed skipped:", error instanceof Error ? error.message : String(error));
  }
}

