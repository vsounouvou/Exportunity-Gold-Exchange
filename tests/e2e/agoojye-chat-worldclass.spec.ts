import { expect, test, type Page, type Route } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const now = new Date("2026-07-28T08:30:00+01:00");
const iso = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

const user = {
  id: 11,
  email: "vital@agoojiye.com",
  displayName: "Vital Sounouvou",
  roles: ["admin"],
  permissions: ["*"],
  currentMode: "admin",
};

const directory = [
  { id: 11, displayName: "Vital Sounouvou", firstName: "Vital", role: "Direction", teamId: 1, status: "active" },
  { id: 22, displayName: "Soriane Houngbédji", firstName: "Soriane", role: "Partenariats", teamId: 2, status: "Active" },
  { id: 23, displayName: "Régis Dossou", firstName: "Régis", role: "Opérations", teamId: 1, status: "actif" },
  { id: 24, displayName: "Maryse Kora", firstName: "Maryse", role: "Communication", teamId: 3, status: "active" },
  { id: 25, displayName: "Christian Tchibozo", firstName: "Christian", role: "Technique", teamId: 4, status: "active" },
];

const bootstrap = {
  ok: true,
  member: {
    id: 11,
    displayName: "Vital Sounouvou",
    firstName: "Vital",
    email: "vital@agoojiye.com",
    role: "Direction",
    teamId: 1,
    team: { id: 1, name: "Direction", mission: "Piloter AGOOJIYE", status: "active" },
    onboardingProgress: 100,
    accessLevel: 7,
    permissions: ["*"],
  },
  navigation: { crm: true, mobility: true, administration: true, ai: true },
  attention: {
    dueToday: 2,
    overdue: 1,
    unreadNotifications: 3,
    pendingDecisions: 1,
    documentsForReview: 1,
  },
  teams: [{ id: 1, name: "Direction", mission: "Piloter AGOOJIYE", status: "active" }],
  directory,
  channels: [],
  messages: [],
  tasks: [{ id: 1, title: "Valider le dossier de lancement", priority: "high", status: "in_progress" }],
  projects: [{ id: 7, name: "Lancement ligne Cotonou", objective: "Préparer les premiers trajets", progress: 68, status: "active" }],
  documents: [{ id: 8, title: "Dossier de lancement", category: "Opérations", status: "under_review" }],
  partners: [],
  meetings: [{ id: 3, title: "Point lancement", startsAt: iso(180), status: "scheduled" }],
  decisions: [{ id: 4, decision: "Valider le parcours pilote", status: "pending_approval", createdAt: iso(-180) }],
  notifications: [],
  mobility: {
    trips: 4,
    bookings: 18,
    tickets: 18,
    revenueXof: 45_000,
    pendingBusRequests: 2,
    pendingDemos: 1,
    pendingOrders: 1,
  },
  agents: [{
    key: "assistant",
    name: "AGOOJIYE — Assistant IA",
    role: "Assistant de travail contextualisé",
    department: "Tous les contextes autorisés",
    level: 1,
    status: "active",
    contexts: ["Espace personnel", "Direction"],
  }],
};

let nextMessageId = 100;
const channelMessages = new Map<number, any[]>([
  [1, [
    {
      id: 91,
      channelId: 1,
      senderUserId: 23,
      senderName: "Régis Dossou",
      senderRole: "Opérations",
      body: "Le manifeste du trajet pilote est prêt. Maryse, peux-tu vérifier le message voyageurs ?",
      messageType: "text",
      attachments: [],
      reactions: [{ emoji: "✅", count: 2, userIds: [11, 24], users: ["Vital", "Maryse"] }],
      pinned: true,
      deliveryStatus: "read",
      createdAt: iso(-48),
      threadReplyCount: 2,
      replyPreview: null,
    },
    {
      id: 92,
      channelId: 1,
      senderUserId: 24,
      senderName: "Maryse Kora",
      senderRole: "Communication",
      body: "Oui. Je finalise la version française avant 10 h.",
      messageType: "text",
      attachments: [],
      reactions: [],
      pinned: false,
      deliveryStatus: "read",
      createdAt: iso(-36),
      threadReplyCount: 0,
      replyPreview: null,
    },
    {
      id: 93,
      channelId: 1,
      senderUserId: 11,
      senderName: "Vital Sounouvou",
      senderRole: "Direction",
      body: "@AGOOJIYE résume les points à valider avant le départ.",
      messageType: "text",
      attachments: [],
      reactions: [],
      pinned: false,
      deliveryStatus: "read",
      createdAt: iso(-20),
      threadReplyCount: 0,
      replyPreview: null,
    },
    {
      id: 94,
      channelId: 1,
      senderUserId: null,
      senderName: "AGOOJIYE — Assistant IA",
      senderRole: "Assistant IA",
      body: "**Trois validations restent ouvertes :**\n\n- message voyageurs ;\n- manifeste final ;\n- confirmation du point d'embarquement.",
      messageType: "assistant",
      attachments: [],
      reactions: [],
      pinned: false,
      deliveryStatus: "read",
      createdAt: iso(-19),
      threadReplyCount: 0,
      replyPreview: { id: 93, senderName: "Vital Sounouvou", body: "@AGOOJIYE résume les points à valider avant le départ." },
    },
  ]],
  [2, [
    {
      id: 95,
      channelId: 2,
      senderUserId: 22,
      senderName: "Soriane Houngbédji",
      senderRole: "Partenariats",
      body: "Le partenaire confirme sa présence à la démonstration de jeudi.",
      messageType: "text",
      attachments: [],
      reactions: [],
      pinned: false,
      deliveryStatus: "read",
      createdAt: iso(-14),
      threadReplyCount: 0,
      replyPreview: null,
    },
    {
      id: 96,
      channelId: 2,
      senderUserId: 11,
      senderName: "Vital Sounouvou",
      senderRole: "Direction",
      body: "Parfait, merci. Ajoutons-le au déroulé.",
      messageType: "text",
      attachments: [],
      reactions: [{ emoji: "👍", count: 1, userIds: [22], users: ["Soriane"] }],
      pinned: false,
      deliveryStatus: "read",
      createdAt: iso(-10),
      threadReplyCount: 0,
      replyPreview: null,
    },
  ]],
]);

const conversations = [
  {
    id: 1,
    slug: "equipe-operations",
    name: "Équipe opérations",
    description: "Coordination des trajets et du lancement",
    type: "channel",
    confidentiality: 2,
    memberCount: 5,
    members: directory,
    peer: null,
    unreadCount: 2,
    favorite: true,
    archived: false,
    mutedUntil: null,
    folder: null,
    lastMessage: {
      id: 94,
      body: "Trois validations restent ouvertes",
      senderUserId: null,
      senderName: "AGOOJIYE — Assistant IA",
      createdAt: iso(-19),
      messageType: "assistant",
    },
    updatedAt: iso(-19),
  },
  {
    id: 2,
    slug: "dm-11-22",
    name: "Soriane Houngbédji",
    description: "Partenariats",
    type: "direct",
    confidentiality: 7,
    memberCount: 2,
    members: [directory[0], directory[1]],
    peer: directory[1],
    unreadCount: 1,
    favorite: false,
    archived: false,
    mutedUntil: null,
    folder: null,
    lastMessage: {
      id: 96,
      body: "Parfait, merci. Ajoutons-le au déroulé.",
      senderUserId: 11,
      senderName: "Vital Sounouvou",
      createdAt: iso(-10),
      messageType: "text",
    },
    updatedAt: iso(-10),
  },
  {
    id: 3,
    slug: "produit-technique",
    name: "Produit & technique",
    description: "Bus, recharge et expérience numérique",
    type: "channel",
    confidentiality: 3,
    memberCount: 3,
    members: [directory[0], directory[4]],
    peer: null,
    unreadCount: 0,
    favorite: false,
    archived: false,
    mutedUntil: null,
    folder: null,
    lastMessage: {
      id: 90,
      body: "La vérification technique est terminée.",
      senderUserId: 25,
      senderName: "Christian Tchibozo",
      createdAt: iso(-90),
      messageType: "text",
    },
    updatedAt: iso(-90),
  },
] as any[];

let aiMessages = [
  {
    id: "ai-user-1",
    conversationId: "conv-direction",
    role: "user",
    content: "Prépare la synthèse du lancement.",
    sources: [],
    createdAt: iso(-80),
  },
  {
    id: "ai-answer-1",
    conversationId: "conv-direction",
    role: "assistant",
    content: "### Synthèse\n\nLe lancement est **en bonne voie**. Le manifeste et le message voyageurs restent à valider.",
    sources: [
      { type: "Projet", title: "Lancement ligne Cotonou", detail: "Avancement : 68 %", href: "/workspace/travail" },
      { type: "Document", title: "Dossier de lancement", detail: "En cours de validation", href: "/workspace/documents" },
    ],
    proposedActions: [
      {
        id: "action-1",
        actionType: "create_task",
        label: "Créer la tâche « Valider le message voyageurs »",
        payload: { title: "Valider le message voyageurs", priority: "high" },
        riskLevel: "low",
        status: "proposed",
        requiresApproval: true,
      },
    ],
    provider: "deterministic",
    model: "agoojye-local",
    feedback: null,
    createdAt: iso(-79),
  },
];

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

async function installWorkspaceMocks(page: Page) {
  await page.addInitScript(({ storedUser }) => {
    localStorage.setItem(
      "ece_session",
      "eyJhbGciOiJub25lIn0.eyJ0ZW5hbnRLZXkiOiJhZ29vaml5ZSJ9.",
    );
    localStorage.setItem("ece_user", JSON.stringify(storedUser));
    localStorage.setItem("ece_language", "fr");
  }, { storedUser: user });

  await page.route("**/api/tenant", (route) =>
    json(route, {
      id: 3162,
      key: "agoojye",
      name: "AGOOJIYE",
      domains: ["agoojiye.com"],
      themeConfig: { brand: "agoojye" },
      featureFlags: {},
    }),
  );
  await page.route("**/api/ece/auth/me", (route) => json(route, user));
  await page.route("**/api/agoojye/os/member/bootstrap", (route) => json(route, bootstrap));
  await page.route("**/api/agoojye/chat/member/conversations", (route) =>
    json(route, { ok: true, items: conversations, unreadTotal: 3, directory }),
  );
  await page.route(/\/api\/agoojye\/chat\/member\/channels\/(\d+)\/draft(?:\?.*)?$/, (route) => {
    if (route.request().method() === "GET") return json(route, { ok: true, item: null });
    return json(route, { ok: true });
  });
  await page.route(/\/api\/agoojye\/chat\/member\/channels\/(\d+)\/messages(?:\?.*)?$/, async (route) => {
    const channelId = Number(route.request().url().match(/channels\/(\d+)/)?.[1] || 0);
    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      const item = {
        id: ++nextMessageId,
        channelId,
        senderUserId: 11,
        senderName: "Vital Sounouvou",
        senderRole: "Direction",
        body: payload.body,
        messageType: payload.messageType || "text",
        replyToMessageId: payload.replyToMessageId || null,
        threadRootMessageId: null,
        clientMessageId: payload.clientMessageId,
        attachments: [],
        reactions: [],
        pinned: false,
        deliveryStatus: "sent",
        createdAt: iso(0),
        threadReplyCount: 0,
        replyPreview: null,
      };
      channelMessages.set(channelId, [...(channelMessages.get(channelId) || []), item]);
      return json(route, { ok: true, item }, 201);
    }
    return json(route, {
      ok: true,
      items: channelMessages.get(channelId) || [],
      page: { hasMore: false, nextBefore: null },
    });
  });
  await page.route("**/api/agoojye/chat/member/ai/contexts", (route) =>
    json(route, {
      ok: true,
      items: [
        { type: "personal", id: null, label: "Espace personnel", description: "Vos tâches, réunions et documents autorisés." },
        { type: "direction", id: null, label: "Direction générale", description: "Vue de direction selon vos autorisations." },
        { type: "project", id: "7", label: "Lancement ligne Cotonou", description: "Projet de lancement du trajet pilote." },
      ],
    }),
  );
  await page.route("**/api/agoojye/chat/member/ai/conversations", (route) =>
    json(route, {
      ok: true,
      items: [{
        id: "conv-direction",
        title: "Synthèse du lancement",
        contextType: "direction",
        contextId: null,
        contextLabel: "Direction générale",
        pinned: true,
        status: "active",
        lastMessageAt: iso(-79),
        createdAt: iso(-120),
        updatedAt: iso(-79),
      }],
    }),
  );
  await page.route("**/api/agoojye/chat/member/ai/conversations/conv-direction/messages", (route) =>
    json(route, {
      ok: true,
      conversation: {
        id: "conv-direction",
        title: "Synthèse du lancement",
        contextType: "direction",
        contextId: null,
        contextLabel: "Direction générale",
        pinned: true,
        status: "active",
        createdAt: iso(-120),
        updatedAt: iso(-79),
      },
      items: aiMessages,
    }),
  );
  await page.route("**/api/agoojye/chat/member/ai/conversations/conv-direction/stream", async (route) => {
    const submitted = route.request().postDataJSON();
    const userMessage = {
      id: "ai-user-2",
      conversationId: "conv-direction",
      role: "user",
      content: submitted.query,
      sources: [],
      createdAt: iso(1),
    };
    const answer = {
      id: "ai-answer-2",
      conversationId: "conv-direction",
      role: "assistant",
      content: "Les priorités sont le manifeste, le message voyageurs et la confirmation du point d'embarquement.",
      sources: [{ type: "Projet", title: "Lancement ligne Cotonou", detail: "Avancement : 68 %", href: "/workspace/travail" }],
      proposedActions: [],
      provider: "deterministic",
      model: "agoojye-local",
      createdAt: iso(2),
    };
    aiMessages = [...aiMessages, userMessage, answer];
    const body = [
      "event: user_message",
      `data: ${JSON.stringify({ item: userMessage, title: "Synthèse du lancement" })}`,
      "",
      "event: delta",
      `data: ${JSON.stringify({ text: "Les priorités sont le manifeste, " })}`,
      "",
      "event: delta",
      `data: ${JSON.stringify({ text: "le message voyageurs et le point d'embarquement." })}`,
      "",
      "event: complete",
      `data: ${JSON.stringify({ item: answer })}`,
      "",
      "",
    ].join("\n");
    await route.fulfill({ status: 200, contentType: "text/event-stream; charset=utf-8", body });
  });
  await page.route("**/api/agoojye/chat/member/ai/actions/action-1/approve", async (route) => {
    aiMessages = aiMessages.map((message) => ({
      ...message,
      proposedActions: message.proposedActions?.map((action: any) =>
        action.id === "action-1" ? { ...action, status: "completed" } : action,
      ),
    }));
    return json(route, { ok: true, item: { id: 501, title: "Valider le message voyageurs" } }, 201);
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

async function hideDevelopmentTapTrace(page: Page) {
  const trace = page.getByTestId("tap-trace-toggle");
  if (await trace.count()) {
    await trace.evaluate((node) => {
      const container = node.closest(".fixed");
      if (container instanceof HTMLElement) container.style.display = "none";
    });
  }
}

test("communications équipe: conversation centrale, envoi optimiste et contexte", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await installWorkspaceMocks(page);
  await page.goto("/workspace/messages?channel=1");

  await expect(page.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "# Équipe opérations" })).toBeVisible();
  await expect(page.getByText("Trois validations restent ouvertes", { exact: false }).last()).toBeVisible();
  await expect(page.locator("button:visible").filter({ hasText: "Soriane Houngbédji" }).first()).toBeVisible();
  await expect(page.getByText("3 non lus", { exact: true })).toBeVisible();

  await page.keyboard.press("Control+k");
  await expect(page.getByPlaceholder("Rechercher dans tous vos messages autorisés")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("Rechercher dans tous vos messages autorisés")).toHaveCount(0);

  const composer = page.getByLabel("Écrire un message");
  await composer.fill("Le point d'embarquement est confirmé.");
  await page.getByRole("button", { name: "Envoyer le message" }).click();
  await expect(page.getByText("Le point d'embarquement est confirmé.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Informations sur la conversation" }).click();
  await expect(page.getByRole("heading", { name: "Informations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Éléments épinglés" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await hideDevelopmentTapTrace(page);
  await page.screenshot({ path: testInfo.outputPath("communications-1440.png"), fullPage: false });
});

test("message direct mobile: liste et conversation sont deux écrans distincts", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installWorkspaceMocks(page);
  await page.goto("/workspace/messages");

  await expect(page.getByRole("heading", { name: "Messages", level: 1 })).toBeVisible();
  const sorianeConversation = page.locator("button:visible").filter({ hasText: "Soriane Houngbédji" }).first();
  await expect(sorianeConversation).toBeVisible();
  await sorianeConversation.click();
  await expect(page.getByRole("heading", { name: "Soriane Houngbédji" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "# Soriane Houngbédji" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retour aux conversations" })).toBeVisible();
  await expect(page.getByText(/Hors ligne · Partenariats/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer le message" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await hideDevelopmentTapTrace(page);
  await page.screenshot({ path: testInfo.outputPath("direct-390.png"), fullPage: false });
});

test("assistant tablette: sources, approbation humaine et flux visible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await installWorkspaceMocks(page);
  await page.goto("/workspace/chat?conversation=conv-direction");

  await expect(page.getByRole("heading", { name: "AGOOJIYE — Assistant IA" })).toBeVisible();
  await expect(page.getByText("Le lancement est en bonne voie.", { exact: false })).toBeVisible();
  await expect(page.getByText("Créer la tâche « Valider le message voyageurs »")).toBeVisible();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByText("Action exécutée après validation")).toBeVisible();

  await page.getByLabel("Votre demande à AGOOJIYE").fill("Quelles sont les trois priorités ?");
  await page.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByText("Les priorités sont le manifeste", { exact: false }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await hideDevelopmentTapTrace(page);
  await page.screenshot({ path: testInfo.outputPath("assistant-768.png"), fullPage: false });
});

test("assistant écran large: historique discret et conversation lisible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1728, height: 1050 });
  await installWorkspaceMocks(page);
  await page.goto("/workspace/chat?conversation=conv-direction");

  await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  await expect(page.getByText("Synthèse du lancement", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "AGOOJIYE — Assistant IA" })).toBeVisible();
  await expect(page.getByText("Direction générale", { exact: true }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await hideDevelopmentTapTrace(page);
  await page.screenshot({ path: testInfo.outputPath("assistant-1728.png"), fullPage: false });
});
