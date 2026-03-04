import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";

import { db } from "@db";
import {
  creatorProfiles,
  eceUsers,
  intellects,
  mindbaseMindbases,
  mindbaseUserRoles,
  mindbaseWorkspaceAgents,
  mindbaseWorkspaceMembers,
  mindbaseWorkspaces,
} from "@db/schema";

import { ensureMindbaseTables } from "../server/lib/mindbase/ensureTables";
import { buildPasswordSetupLink, createPasswordSetupToken, resolvePasswordSetupBaseUrl } from "../server/lib/password-setup";
import { ensureTenants, getTenantByKey } from "../server/lib/tenants";

function slugify(input: string) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function run() {
  await ensureTenants();
  await ensureMindbaseTables();

  const tenant = await getTenantByKey("mindbase");
  if (!tenant?.id) throw new Error("mindbase tenant not found");

  const seedAccounts = [
    { email: "vitalsounouvou2025@gmail.com", displayName: "Vital Sounouvou", admin: true },
    { email: "vs@exportunity.net", displayName: "VS Exportunity", admin: true },
    { email: "demo@mindbase.ai", displayName: "MindBase Demo", admin: false },
  ] as const;

  const setupBaseUrl = resolvePasswordSetupBaseUrl();
  const setupLinks: Array<{ email: string; link: string }> = [];
  const demoPassword = String(process.env.MINDBASE_DEMO_USER_PASSWORD || "MindbaseDemo123!").trim();
  const demoPasswordHash = await bcrypt.hash(demoPassword, 10);

  for (const account of seedAccounts) {
    const existing = await db.query.eceUsers.findFirst({
      where: eq(eceUsers.email, account.email),
    });

    if (!existing) {
      const [created] = await db
        .insert(eceUsers)
        .values({
          email: account.email,
          passwordHash: account.admin ? null : demoPasswordHash,
          displayName: account.displayName,
          role: account.admin ? ("admin" as any) : ("buyer" as any),
          roles: account.admin ? (["admin", "creator"] as any) : (["buyer", "client"] as any),
          permissions: account.admin ? (["*"] as any) : ([] as any),
          isActive: true,
          emailVerified: true,
          verificationLevel: "NONE",
          currentMode: account.admin ? ("admin" as any) : ("buyer" as any),
          buyerType: "retail",
          metadata: account.admin
            ? { seeded: true, mustChangePassword: true }
            : { seeded: true, source: "mindbase_demo_seed" },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (account.admin && created?.id) {
        const setup = await createPasswordSetupToken({ userId: created.id, ttlHours: 24, invalidateExisting: false });
        setupLinks.push({
          email: account.email,
          link: buildPasswordSetupLink(setupBaseUrl, setup.rawToken),
        });
      }
    }

    const user = existing || (await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, account.email) }));
    if (user?.id && account.admin) {
      await db
        .insert(mindbaseUserRoles)
        .values({
          tenantId: tenant.id,
          userId: user.id,
          role: "admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [mindbaseUserRoles.tenantId, mindbaseUserRoles.userId, mindbaseUserRoles.role],
        });
    }
  }

  const users = await db.query.eceUsers.findMany({ orderBy: (f, { asc }) => [asc(f.id)], limit: 20 });
  if (!users.length) {
    throw new Error("No users available in ece_users. Create users first.");
  }

  const creators = users.slice(0, Math.min(5, users.length));
  for (const user of creators) {
    const display = String(user.displayName || user.email || `Creator ${user.id}`);
    const baseSlug = slugify(display) || `creator-${user.id}`;
    let candidate = baseSlug;
    let step = 1;
    while (true) {
      const conflict = await db.query.creatorProfiles.findFirst({
        where: and(eq(creatorProfiles.tenantId, tenant.id), eq(creatorProfiles.shareSlug, candidate)),
      });
      if (!conflict || conflict.userId === user.id) break;
      step += 1;
      candidate = `${baseSlug}-${step}`;
    }

    await db
      .insert(creatorProfiles)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        displayName: display,
        headline: "Mindbase creator",
        bio: "Deploying practical expertise as Intellects.",
        shareSlug: candidate,
        verificationStatus: "unverified",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [creatorProfiles.tenantId, creatorProfiles.userId],
        set: {
          displayName: display,
          shareSlug: candidate,
          updatedAt: new Date(),
        },
      });
  }

  const templates = [
    { name: "Mason", category: "construction", tone: "direct", tagline: "Construction estimation and site execution planning." },
    { name: "Accountant", category: "finance", tone: "structured", tagline: "SME accounting, margin analysis, and monthly close prep." },
    { name: "Trainer", category: "operations", tone: "friendly", tagline: "Team onboarding playbooks and operational training flows." },
  ];

  let created = 0;
  let updated = 0;
  const intellectIds: string[] = [];

  for (let i = 0; i < templates.length; i += 1) {
    const owner = creators[i % creators.length];
    const template = templates[i];
    const baseSlug = slugify(template.name) || `intellect-${i + 1}`;
    const slug = `${baseSlug}-${owner.id}`;
    const existing = await db.query.intellects.findFirst({
      where: and(eq(intellects.tenantId, tenant.id), eq(intellects.slug, slug)),
    });

    const payload = {
      tenantId: tenant.id,
      ownerUserId: owner.id,
      name: template.name,
      slug,
      tagline: template.tagline,
      description: `Specialized ${template.category} expertise focused on practical outcomes.`,
      category: template.category,
      tags: [template.category, "mindbase", "intellect"],
      personaRole: template.name,
      personaTone: template.tone,
      personaRules: [
        "Be explicit about assumptions.",
        "Ask clarifying questions when data is missing.",
        "Provide operational next steps.",
      ],
      styleConstraints: ["Use bullet points", "Keep answers concise", "Cite filenames when knowledge is used"],
      systemPrompt: `You are ${template.name}. Deliver practical outcomes with clear assumptions and concise execution steps.`,
      accessPolicy: i % 3 === 0 ? ("paid" as const) : ("public" as const),
      pricePer100Messages: i % 3 === 0 ? 500 : 0,
      isPublished: true,
      publishStatus: "approved" as const,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(intellects).set(payload).where(eq(intellects.id, existing.id));
      updated += 1;
      intellectIds.push(existing.id);
    } else {
      const [inserted] = await db.insert(intellects).values({
        ...payload,
        createdAt: new Date(),
      }).returning();
      if (inserted?.id) intellectIds.push(inserted.id);
      created += 1;
    }
  }

  const primaryOwner = creators[0];
  const primaryProfile = await db.query.creatorProfiles.findFirst({
    where: and(eq(creatorProfiles.tenantId, tenant.id), eq(creatorProfiles.userId, primaryOwner.id)),
  });

  const mindbaseSlug = slugify(primaryProfile?.shareSlug || primaryOwner.displayName || `creator-${primaryOwner.id}`) || `creator-${primaryOwner.id}`;
  const [mindbaseRecord] = await db
    .insert(mindbaseMindbases)
    .values({
      tenantId: tenant.id,
      ownerUserId: primaryOwner.id,
      slug: mindbaseSlug,
      title: `${primaryOwner.displayName || primaryOwner.email}'s MindBase`,
      tagline: "Own your intelligence. Deploy your Mind.",
      description: "Demo MindBase profile for MVP validation.",
      isPublished: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [mindbaseMindbases.tenantId, mindbaseMindbases.ownerUserId],
      set: {
        slug: mindbaseSlug,
        title: `${primaryOwner.displayName || primaryOwner.email}'s MindBase`,
        tagline: "Own your intelligence. Deploy your Mind.",
        description: "Demo MindBase profile for MVP validation.",
        isPublished: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  const workspaceName = "MindBase Demo Workspace";
  const existingWorkspace = await db.query.mindbaseWorkspaces.findFirst({
    where: and(eq(mindbaseWorkspaces.tenantId, tenant.id), eq(mindbaseWorkspaces.ownerUserId, primaryOwner.id), eq(mindbaseWorkspaces.name, workspaceName)),
  });
  const workspace =
    existingWorkspace ||
    (
      await db
        .insert(mindbaseWorkspaces)
        .values({
          tenantId: tenant.id,
          ownerUserId: primaryOwner.id,
          name: workspaceName,
          description: "Demo workspace with multiple agents for group routing.",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning()
    )[0];

  if (workspace) {
    await db
      .insert(mindbaseWorkspaceMembers)
      .values({
        tenantId: tenant.id,
        workspaceId: workspace.id,
        userId: primaryOwner.id,
        role: "owner",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [mindbaseWorkspaceMembers.workspaceId, mindbaseWorkspaceMembers.userId],
      });

    for (const intellectId of intellectIds) {
      await db
        .insert(mindbaseWorkspaceAgents)
        .values({
          tenantId: tenant.id,
          workspaceId: workspace.id,
          intellectId,
          createdAt: new Date(),
        })
        .onConflictDoNothing({
          target: [mindbaseWorkspaceAgents.workspaceId, mindbaseWorkspaceAgents.intellectId],
        });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: tenant.key,
        setupLinksGenerated: setupLinks.length,
        creatorsSeeded: creators.length,
        mindbaseId: mindbaseRecord?.id || null,
        intellectsCreated: created,
        intellectsUpdated: updated,
        demoWorkspaceId: workspace?.id || null,
      },
      null,
      2,
    ),
  );

  if (setupLinks.length) {
    for (const setup of setupLinks) {
      console.log(`[mindbase-seed] setup link (${setup.email}): ${setup.link}`);
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed:mindbase] failed", error);
    process.exit(1);
  });
