import { getSetting } from "./settings";

export type EceOnboardingMessageSeed = {
  role: "assistant" | "system";
  content: string;
  quickReplies?: string[];
};

export type EceOnboardingRoomConfig = {
  introMessages?: EceOnboardingMessageSeed[];
  afterFirstUserMessage?: EceOnboardingMessageSeed[];
};

export type EceOnboardingPwaInstallConfig = {
  enabled: boolean;
  minDaysBetweenPrompts: number;
  roles: string[];
  message: EceOnboardingMessageSeed;
  postInstallMessage: EceOnboardingMessageSeed;
};

export type EceOnboardingConfigV1 = {
  version: 1;
  enabled: boolean;
  rooms: Record<string, EceOnboardingRoomConfig>;
  pwaInstall: EceOnboardingPwaInstallConfig;
  paidIntelligenceConfirmation: EceOnboardingMessageSeed;
};

const DEFAULT_ECE_ONBOARDING_CONFIG: EceOnboardingConfigV1 = {
  version: 1,
  enabled: true,
  rooms: {
    support: {
      introMessages: [
        {
          role: "assistant",
          content:
            "👋 Bienvenue sur **Bourse de l’Or Pro**\n\nIci, vous gérez votre activité simplement —\ncomme sur WhatsApp, mais avec des agents intelligents.",
        },
        {
          role: "assistant",
          content: "Dites-moi : qu’est-ce que vous voulez faire aujourd’hui ?",
          quickReplies: [
            "Produire de l’or",
            "Acheter / vendre",
            "Livrer",
            "Gérer mon argent",
            "Juste explorer",
          ],
        },
      ],
    },
    sales: {
      introMessages: [
        {
          role: "assistant",
          content:
            "🛒 **Espace Vente**\n\nIci, vous recevez vos ventes, confirmations clients et paiements.\n\nVous pouvez écrire, parler ou envoyer des photos —\nje m’occupe du reste.",
        },
      ],
      afterFirstUserMessage: [
        {
          role: "assistant",
          content:
            "💡 Astuce\n\nInstallez l’application pour gérer vos ventes plus vite\net recevoir les notifications instantanément.",
          quickReplies: ["📲 Installer l’application", "Continuer dans le navigateur"],
        },
      ],
    },
    production: {
      introMessages: [
        {
          role: "assistant",
          content:
            "🏭 **Production**\n\nQuand vous avez de l’or, écrivez simplement :\n\n*“J’ai de l’or”*\n\nVous pouvez aussi envoyer un message vocal ou des photos.",
        },
        {
          role: "assistant",
          content: "🎙️ Exemple :\n“J’ai produit 620 grammes aujourd’hui.”",
        },
      ],
    },
    delivery: {
      introMessages: [
        {
          role: "assistant",
          content:
            "🚚 **Livraisons**\n\nIci, vous recevez vos missions de livraison.\n\nAppuyez simplement sur les boutons pour confirmer\n— aucun formulaire.",
        },
        {
          role: "system",
          content: "📍 L’application fonctionne même avec une mauvaise connexion.",
        },
      ],
    },
  },
  pwaInstall: {
    enabled: true,
    minDaysBetweenPrompts: 7,
    roles: ["seller", "mine_owner", "delivery", "investor"],
    message: {
      role: "system",
      content:
        "📲 **Installer l’application Bourse de l’Or Pro**\n\n✔️ Plus rapide\n✔️ Notifications instantanément\n✔️ Fonctionne hors connexion\n\nRecommandé pour gérer votre activité.",
      quickReplies: ["Installer maintenant", "Plus tard"],
    },
    postInstallMessage: {
      role: "system",
      content:
        "✅ Application installée\n\nVous pouvez maintenant gérer votre activité\nencore plus rapidement.",
    },
  },
  paidIntelligenceConfirmation: {
    role: "assistant",
    content:
      "🤖 Analyse intelligente\n\nJe peux analyser les photos et vous proposer\nles prochaines étapes (pureté, vente, logistique).\n\nCoût : **1 500 CFA**",
    quickReplies: ["Confirmer", "Annuler"],
  },
};

export function getDefaultEceOnboardingConfig(): EceOnboardingConfigV1 {
  return DEFAULT_ECE_ONBOARDING_CONFIG;
}

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeMessageSeed(value: unknown): EceOnboardingMessageSeed | null {
  if (!isObject(value)) return null;
  const role = value.role === "assistant" || value.role === "system" ? value.role : null;
  const content = typeof value.content === "string" ? value.content : null;
  if (!role || !content) return null;
  const quickReplies = Array.isArray(value.quickReplies) ? value.quickReplies.map((v) => String(v)) : undefined;
  return quickReplies?.length ? { role, content, quickReplies } : { role, content };
}

function normalizeRoomConfig(value: unknown): EceOnboardingRoomConfig | null {
  if (!isObject(value)) return null;
  const intro = Array.isArray(value.introMessages)
    ? value.introMessages.map(normalizeMessageSeed).filter(Boolean)
    : undefined;
  const afterFirst = Array.isArray(value.afterFirstUserMessage)
    ? value.afterFirstUserMessage.map(normalizeMessageSeed).filter(Boolean)
    : undefined;
  const room: EceOnboardingRoomConfig = {};
  if (intro?.length) room.introMessages = intro as EceOnboardingMessageSeed[];
  if (afterFirst?.length) room.afterFirstUserMessage = afterFirst as EceOnboardingMessageSeed[];
  return Object.keys(room).length ? room : null;
}

function mergeRoomConfig(base: EceOnboardingRoomConfig, override?: EceOnboardingRoomConfig | null) {
  if (!override) return base;
  return {
    ...base,
    ...override,
    introMessages: override.introMessages ?? base.introMessages,
    afterFirstUserMessage: override.afterFirstUserMessage ?? base.afterFirstUserMessage,
  };
}

function mergeConfig(base: EceOnboardingConfigV1, override: unknown): EceOnboardingConfigV1 {
  if (!isObject(override)) return base;
  if (override.version !== 1) return base;

  const next: EceOnboardingConfigV1 = {
    ...base,
    enabled: typeof override.enabled === "boolean" ? override.enabled : base.enabled,
    rooms: { ...base.rooms },
    pwaInstall: { ...base.pwaInstall },
    paidIntelligenceConfirmation: base.paidIntelligenceConfirmation,
  };

  if (isObject(override.rooms)) {
    for (const [roomKey, roomRaw] of Object.entries(override.rooms)) {
      const normalized = normalizeRoomConfig(roomRaw);
      if (!normalized) continue;
      next.rooms[String(roomKey)] = mergeRoomConfig(base.rooms[String(roomKey)] ?? {}, normalized);
    }
  }

  if (isObject(override.pwaInstall)) {
    const pwa = override.pwaInstall;
    next.pwaInstall.enabled = typeof pwa.enabled === "boolean" ? pwa.enabled : next.pwaInstall.enabled;
    next.pwaInstall.minDaysBetweenPrompts =
      Number.isFinite(Number(pwa.minDaysBetweenPrompts)) && Number(pwa.minDaysBetweenPrompts) > 0
        ? Number(pwa.minDaysBetweenPrompts)
        : next.pwaInstall.minDaysBetweenPrompts;
    next.pwaInstall.roles = Array.isArray(pwa.roles) ? pwa.roles.map((v) => String(v)) : next.pwaInstall.roles;

    const message = normalizeMessageSeed(pwa.message);
    if (message) next.pwaInstall.message = message;

    const postInstall = normalizeMessageSeed(pwa.postInstallMessage);
    if (postInstall) next.pwaInstall.postInstallMessage = postInstall;
  }

  const paid = normalizeMessageSeed((override as any).paidIntelligenceConfirmation);
  if (paid) next.paidIntelligenceConfirmation = paid;

  return next;
}

export async function getEceOnboardingConfig(tenantKey: string): Promise<EceOnboardingConfigV1> {
  const base = getDefaultEceOnboardingConfig();
  const scope = `tenant:${tenantKey}`;
  const stored = await getSetting<any>(scope, "ece.onboarding.v1", undefined);
  return mergeConfig(base, stored);
}

