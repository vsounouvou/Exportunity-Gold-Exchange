import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const now = Date.now();
const future = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString();

const tenant = {
  id: 3162,
  key: "agoojye",
  name: "AGOOJIYE",
  domains: ["agoojiye.com"],
  themeConfig: { brand: "agoojye" },
  featureFlags: {},
};

function appUser(role: "worker" | "manager" | "controller" | "admin") {
  const admin = role === "admin";
  return {
    id: admin ? 900 : role === "manager" ? 201 : role === "controller" ? 301 : 101,
    email: `${role}@agoojiye.com`,
    displayName: admin ? "Vital Administration" : role === "manager" ? "Soriane Responsable" : role === "controller" ? "Regis Contrôle" : "Maryse Équipe",
    roles: admin ? ["admin"] : ["buyer"],
    permissions: admin ? ["*"] : [],
    currentMode: admin ? "admin" : "buyer",
  };
}

async function installAuthenticatedRole(page: Page, role: "worker" | "manager" | "controller" | "admin") {
  const user = appUser(role);
  await page.addInitScript(({ storedUser }) => {
    localStorage.setItem("ece_session", "agoojye-e2e-session");
    localStorage.setItem("ece_user", JSON.stringify(storedUser));
    localStorage.setItem("ece_language", "fr");
  }, { storedUser: user });
  await page.route("**/api/tenant", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tenant) }));
  await page.route("**/api/ece/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }));
  return user;
}

function workspaceBootstrap(role: "worker" | "manager" | "admin") {
  const manager = role === "manager";
  const admin = role === "admin";
  const user = appUser(role);
  const accessLevel = admin ? 7 : manager ? 4 : 2;
  const team = { id: manager ? 22 : 33, name: manager ? "Partenariats" : "Communication", mission: "Faire avancer la mobilité AGOOJIYE.", status: "active" };
  return {
    ok: true,
    member: {
      id: user.id,
      displayName: user.displayName,
      firstName: user.displayName.split(" ")[0],
      email: user.email,
      role: manager ? "Responsable partenariats" : admin ? "Direction" : "Chargée de communication",
      teamId: team.id,
      team,
      onboardingProgress: 100,
      accessLevel,
      permissions: manager ? ["crm", "mobility"] : admin ? ["crm", "mobility", "administration"] : ["tasks"],
    },
    navigation: { crm: manager || admin, mobility: manager || admin, administration: admin, ai: true },
    attention: { dueToday: 1, overdue: 1, unreadNotifications: 2, pendingDecisions: manager || admin ? 1 : 0, documentsForReview: 1 },
    teams: [team],
    directory: [
      {
        id: user.id,
        displayName: user.displayName,
        firstName: user.displayName.split(" ")[0],
        email: user.email,
        role: manager ? "Responsable partenariats" : admin ? "Direction" : "Chargée de communication",
        teamId: team.id,
        employmentType: "employee",
        availability: "available",
        onboardingProgress: 100,
        status: "active",
        isCurrentUser: true,
      },
      {
        id: 102,
        displayName: "Christian Technique",
        firstName: "Christian",
        email: "christian@agoojiye.com",
        role: "Ingénieur",
        teamId: team.id,
        employmentType: "volunteer",
        availability: "on_leave",
        onboardingProgress: 75,
        status: "active",
        isCurrentUser: false,
      },
    ],
    channels: [{ id: 1, name: "Équipe AGOOJIYE", slug: "equipe", status: "active" }],
    messages: [],
    tasks: [
      { id: 1, title: "Préparer le point hebdomadaire", priority: "high", status: "in_progress", dueDate: future(-3), teamId: team.id },
      { id: 2, title: "Valider les visuels du trajet", priority: "medium", status: "todo", dueDate: future(22), teamId: team.id },
    ],
    projects: [{ id: 1, name: "Lancement ligne Cotonou", objective: "Préparer le premier trajet.", progress: 65, status: "active" }],
    documents: [{ id: 1, title: "Dossier lancement", category: "opérations", status: "under_review" }],
    partners: manager || admin ? [{ id: 1, name: "Partenaire test", category: "institution", status: "active" }] : [],
    meetings: [{ id: 1, title: "Point lancement", startsAt: future(4), status: "scheduled" }],
    decisions: [{ id: 1, decision: "Valider le parcours pilote", status: "pending_approval", createdAt: future(-24) }],
    notifications: [{ id: 1, title: "Tâche à échéance", body: "Préparer le point hebdomadaire", createdAt: future(-1), readAt: null }],
    mobility: { trips: 4, bookings: 18, tickets: 18, revenueXof: 45_000, pendingBusRequests: 2, pendingDemos: 1, pendingOrders: 1 },
    agents: [{
      key: "assistant",
      name: "AGOOJIYE — Assistant IA",
      role: "Assistant de travail contextualisé",
      department: "Tous les contextes autorisés",
      level: 1,
      status: "active",
      contexts: ["Espace personnel", "Support du département", "Opérations mobilité", "Direction"],
    }],
  };
}

async function mockWorkspace(page: Page, role: "worker" | "manager" | "admin") {
  const bootstrap = workspaceBootstrap(role);
  await page.route("**/api/agoojye/os/member/bootstrap", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bootstrap) }));
  await page.route("**/api/agoojye/os/member/assistant", async (route) => {
    const payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        agent: { name: "AGOOJIYE — Assistant IA", badge: "IA", level: 1 },
        answer: `Synthèse autorisée pour « ${payload.query} ».`,
        matches: [{ type: "Tâche", title: "Préparer le point hebdomadaire", detail: "En cours · Haute", href: "/workspace/tasks" }],
        governance: "Données limitées à vos autorisations. Aucune donnée n'a été modifiée.",
      }),
    });
  });
}

async function expectNoCompetingAssistant(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Falovè|HOWJI|Agents IA|Collègues numériques|AGOOJIYE AI/);
  await expect(page.getByText("AGOOJIYE — Assistant IA").first()).toBeVisible();
}

test("nouveau membre: l'invitation explique l'accueil et l'autorité humaine", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/tenant", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tenant) }));
  await page.route("**/api/agoojye/os/invitations/ux-invitation", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      organization: "AGOOJIYE",
      label: "Équipe lancement mobilité",
      remainingPlaces: 2,
      members: [{ firstName: "Maryse", emailHint: "ma•••@agoojiye.com", activated: false }],
    }),
  }));
  await page.goto("/workspace/rejoindre/ux-invitation");

  await expect(page.getByRole("heading", { name: "Activez votre espace AGOOJIYE" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AGOOJIYE — Assistant IA vous accompagne" })).toBeVisible();
  await expect(page.getByText("Équipe lancement mobilité")).toBeVisible();
  await expect(page.getByText("Maryse · ma•••@agoojiye.com")).toBeVisible();
  await expect(page.getByText(/valid.*responsable humain/i)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Falovè|HOWJI|Agents IA|Collègues numériques/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("nouveau-membre-mobile.png"), fullPage: false });
});

test("collaborateur: l'espace personnel reste simple, français et sans assistant concurrent", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthenticatedRole(page, "worker");
  await mockWorkspace(page, "worker");
  await page.goto("/workspace/chat");

  await expect(page.getByRole("heading", { name: "AGOOJIYE — Assistant IA", level: 1 })).toBeVisible();
  await expect(page.getByText("Votre espace personnel", { exact: false }).first()).toBeVisible();
  await expectNoCompetingAssistant(page);
  await expect(page.getByRole("link", { name: "CRM" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Mobilité" })).toHaveCount(0);

  await page.getByRole("button", { name: "Que dois-je faire aujourd'hui ?" }).click();
  await expect(page.getByLabel("Votre question pour AGOOJIYE")).toHaveValue("Que dois-je faire aujourd'hui ?");
  await page.getByRole("button", { name: "Envoyer la question" }).click();
  await expect(page.getByText(/Synthèse autorisée/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("collaborateur-mobile.png"), fullPage: false });
});

test("responsable: le contexte départemental et les modules autorisés sont évidents", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installAuthenticatedRole(page, "manager");
  await mockWorkspace(page, "manager");
  await page.goto("/workspace/chat");

  await expect(page.getByText("Support du département", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "CRM" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mobilité", exact: true })).toBeVisible();
  await expectNoCompetingAssistant(page);

  await page.getByRole("link", { name: "Équipes" }).click();
  await expect(page.getByText("Salarié", { exact: true })).toBeVisible();
  await expect(page.getByText("Disponible", { exact: true })).toBeVisible();
  await expect(page.getByText("Bénévole", { exact: true })).toBeVisible();
  await expect(page.getByText("En congé", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("responsable-desktop.png"), fullPage: false });
});

test("contrôleur: validation manuelle, doublon et recherche manifeste sont explicites", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await installAuthenticatedRole(page, "controller");
  const trip = {
    trip: { id: 261, departureAt: future(2), arrivalAt: future(3), status: "scheduled", fareXof: 2500 },
    route: { id: 1, origin: "Cotonou", destination: "Porto-Novo", boardingPoint: "Gare AGOOJIYE" },
    bus: { id: 1, slug: "agoojiye-shuttle", name: "AGOOJIYE Shuttle", reference: "AGJ-SH-01", capacity: 32 },
  };
  const manifest = {
    manifest: [
      { passenger: { firstName: "Aminata", lastName: "Sounon" }, booking: { reference: "AGJ-TEST-001" }, ticket: { id: 1, reference: "TKT-TEST-001", seatNumber: "1A", status: "active" } },
      { passenger: { firstName: "Christian", lastName: "Kora" }, booking: { reference: "AGJ-TEST-002" }, ticket: { id: 2, reference: "TKT-TEST-002", seatNumber: "1B", status: "used" } },
    ],
  };
  let validationCount = 0;
  await page.route("**/api/agoojye/staff/trips/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ trips: [trip] }) }));
  await page.route("**/api/agoojye/staff/trips/261/manifest", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(manifest) }));
  await page.route("**/api/agoojye/staff/tickets/validate", (route) => {
    validationCount += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(validationCount === 1 ? { ok: true, message: "Billet valide" } : { ok: false, message: "Billet déjà utilisé" }) });
  });
  await page.goto("/controle");

  await expect(page.getByRole("heading", { name: "Contrôle d'embarquement" })).toBeVisible();
  await expect(page.locator("video")).toBeHidden();
  await page.getByLabel("Code du billet").fill("TKT-TEST-001");
  await page.getByRole("button", { name: "Valider le billet" }).click();
  await expect(page.getByText("Billet valide", { exact: true })).toBeVisible();
  await page.getByLabel("Code du billet").fill("TKT-TEST-001");
  await page.getByRole("button", { name: "Valider le billet" }).click();
  await expect(page.getByText("Billet déjà utilisé", { exact: true })).toBeVisible();

  await page.getByLabel("Rechercher un passager ou une référence").fill("Christian");
  await expect(page.getByText("Christian Kora")).toBeVisible();
  await expect(page.getByText("Aminata Sounon")).toBeHidden();
  await expect(page.getByText("Déjà utilisé", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("controleur-tablette.png"), fullPage: false });
});

test("administrateur: l'assistant unique et la gouvernance sensible sont visibles", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installAuthenticatedRole(page, "admin");
  const bootstrap = workspaceBootstrap("admin");
  const overview = {
    ok: true,
    currentUser: { id: 900, email: "admin@agoojiye.com", displayName: "Vital Administration", superAdmin: true },
    metrics: { activePeople: 5, departments: 4, activeProjects: 3, openTasks: 8, overdueTasks: 2, blockers: 1, vacancies: 1, securityEvents7d: 4 },
    people: bootstrap.directory,
    teams: bootstrap.teams,
    tasks: bootstrap.tasks,
    projects: bootstrap.projects,
    vacancies: [],
    agents: [{ key: "howji", name: "AGOOJIYE — Assistant IA", description: "Assistant unique contextualisé", status: "active", timezone: "Africa/Porto-Novo" }],
    securityEvents: [],
  };
  const assistantPayload = {
    ok: true,
    agent: overview.agents[0],
    actions: [{ id: 1, actionType: "daily_coordination_report", status: "completed", requiresApproval: false, output: { summary: "2 tâches en retard, 1 blocage." }, createdAt: future(-1) }],
  };
  await page.route("**/api/admin/agoojye/workos/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overview) }));
  await page.route("**/api/admin/agoojye/workos/assistant", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(assistantPayload) }));
  await page.route("**/api/admin/agoojye/workos/assistant/run", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, action: assistantPayload.actions[0] }) }));
  await page.goto("/admin/assistant");

  await expect(page.getByRole("heading", { name: "AGOOJIYE — Assistant IA" })).toBeVisible();
  await expect(page.getByText("Approbation humaine obligatoire")).toBeVisible();
  await expect(page.getByRole("link", { name: "Assistant IA" })).toBeVisible();
  await expectNoCompetingAssistant(page);
  await page.getByRole("button", { name: "Générer la synthèse" }).click();
  await expect(page.getByText("Synthèse AGOOJIYE actualisée", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("administrateur-desktop.png"), fullPage: false });
});

test("administrateur mobilité: les coordonnées restent lisibles et les statuts sont confirmés", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installAuthenticatedRole(page, "admin");
  let booking = {
    id: 71,
    reference: "AGJ-TEST-071",
    contactEmail: "contact@agoojiye.com",
    contactPhone: "+229 01 90 00 00 00",
    passengerCount: 2,
    totalXof: 5000,
    status: "confirmed",
    paymentStatus: "paid",
    createdAt: future(-2),
  };
  let patchCount = 0;
  await page.route("**/api/admin/agoojye/mobility/bookings**", async (route) => {
    if (route.request().method() === "PATCH") {
      patchCount += 1;
      booking = { ...booking, ...route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, item: booking }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, items: [booking] }) });
  });
  await page.goto("/admin/reservations");

  await expect(page.getByRole("heading", { name: "Réservations passagers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Administration équipe" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "E-mail" })).toBeVisible();
  await expect(page.getByText("contact@agoojiye.com")).toBeVisible();
  await expect(page.getByText("Confirmé", { exact: true }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Invalid Date|Date invalide/);

  await page.getByLabel("Statut de l'élément 71").selectOption("cancelled");
  expect(patchCount).toBe(0);
  await page.getByRole("button", { name: "Enregistrer le statut de l'élément 71" }).click();
  await expect.poll(() => patchCount).toBe(1);
  await expect(page.getByText("Annulé", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("administrateur-mobilite-desktop.png"), fullPage: false });
});

test("les actions mobiles fixes ne masquent pas les pages transactionnelles", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/tenant", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tenant) }));

  await page.goto("/");
  await expect(page.getByTestId("mobile-booking-cta")).toHaveCount(0);

  await page.goto("/reserver-un-bus");
  await expect(page.getByTestId("mobile-booking-cta")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Envoyer ma demande de bus" })).toBeVisible();

  await page.goto("/liste-prioritaire");
  await expect(page.getByTestId("mobile-booking-cta")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rejoindre la liste prioritaire" })).toBeVisible();

  await page.goto("/commander-un-bus");
  await expect(page.getByTestId("mobile-booking-cta")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Envoyer mon projet de flotte" })).toBeVisible();
});
