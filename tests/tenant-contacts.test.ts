import test from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { nanoid } from "nanoid";

import { db } from "@db";
import { contacts, eceUsers, tenants, userTenantRoles } from "@db/schema";

import { ensureContactTables } from "../server/lib/contact/ensureTables";
import {
  claimLegacyTenantContacts,
  ensureTenantContactLink,
  importTenantContactsCsv,
  listTenantContacts,
  upsertCanonicalContact,
} from "../server/lib/contact/tenantContacts";

test.before(async () => {
  await ensureContactTables();
});

async function createTenant() {
  const [tenant] = await db
    .insert(tenants)
    .values({
      key: `test-contacts-${nanoid(8)}`.toLowerCase(),
      name: `Test Contacts ${nanoid(6)}`,
      domains: [],
      themeConfig: {},
      featureFlags: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  assert.ok(tenant);
  return tenant!;
}

async function createUser() {
  const [user] = await db
    .insert(eceUsers)
    .values({
      email: `contacts.${nanoid(10)}@example.com`,
      passwordHash: `hash_${nanoid(12)}`,
      displayName: `Contacts Tester ${nanoid(4)}`,
      role: "admin",
      roles: ["admin"],
      permissions: ["*"],
      currentMode: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  assert.ok(user);
  return user!;
}

async function attachUserToTenant(tenantId: number, userId: number) {
  await db.insert(userTenantRoles).values({
    tenantId,
    userId,
    role: "TENANT_ADMIN",
    createdAt: new Date(),
  });
}

function uniquePhone() {
  return `+229${randomInt(10000000, 99999999)}`;
}

test("Tenant contacts: manual upsert creates tenant link and is visible", async () => {
  const tenant = await createTenant();
  const user = await createUser();
  await attachUserToTenant(tenant.id, user.id);

  const email = `alice.${nanoid(8)}@example.com`.toLowerCase();
  const phone = uniquePhone();
  const created = await db.transaction(async (tx) => {
    const contact = await upsertCanonicalContact(tx, {
      displayName: "Alice Example",
      company: "Example Co",
      jobTitle: "Owner",
      emails: [email],
      phones: [phone],
      source: "manual",
      sourceSystem: "manual",
      createdByUserId: user.id,
    });
    await ensureTenantContactLink(tx, { tenantId: tenant.id, contactId: contact.contactId, createdByUserId: user.id });
    return contact;
  });

  assert.ok(created.contactId > 0);

  const list = await listTenantContacts({ tenantId: tenant.id, q: email, limit: 50, offset: 0 });
  assert.ok(list.total >= 1);
  assert.ok(list.items.some((item) => item.primaryEmail === email));
});

test("Tenant contacts: CSV import links contacts and list returns them", async () => {
  const tenant = await createTenant();
  const user = await createUser();
  await attachUserToTenant(tenant.id, user.id);

  const email = `bob.${nanoid(8)}@example.com`.toLowerCase();
  const csv = `Name,Email,Phone\nBob Example,${email},${uniquePhone()}\n`;

  const result = await importTenantContactsCsv({
    tenantId: tenant.id,
    userId: user.id,
    fileName: "contacts.csv",
    fileBuffer: Buffer.from(csv, "utf8"),
  });

  assert.equal(result.totalRows, 1);
  assert.ok(result.createdContacts + result.updatedContacts >= 1);

  const list = await listTenantContacts({ tenantId: tenant.id, q: email, limit: 50, offset: 0 });
  assert.ok(list.items.some((item) => item.primaryEmail === email));
});

test("Tenant contacts: claim-legacy links orphaned contacts created by tenant users", async () => {
  const tenant = await createTenant();
  const user = await createUser();
  await attachUserToTenant(tenant.id, user.id);

  const email = `orphan.${nanoid(8)}@example.com`.toLowerCase();
  const orphan = await db
    .insert(contacts)
    .values({
      tenantId: null,
      displayName: "Orphan Contact",
      primaryEmail: email,
      emails: [email],
      sourceSystem: "csv",
      createdByUserId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  assert.ok(orphan[0]?.id);

  const before = await listTenantContacts({ tenantId: tenant.id, q: email, limit: 50, offset: 0 });
  assert.ok(!before.items.some((item) => item.primaryEmail === email));

  const claimed = await claimLegacyTenantContacts({ tenantId: tenant.id, userId: user.id, force: false });
  assert.ok(claimed.claimed >= 1);

  const after = await listTenantContacts({ tenantId: tenant.id, q: email, limit: 50, offset: 0 });
  assert.ok(after.items.some((item) => item.primaryEmail === email));
});

test("Tenant contacts: default filters include unknown consent", async () => {
  const tenant = await createTenant();
  const user = await createUser();
  await attachUserToTenant(tenant.id, user.id);

  const email = `consent.${nanoid(8)}@example.com`.toLowerCase();
  const created = await db.transaction(async (tx) => {
    const contact = await upsertCanonicalContact(tx, {
      displayName: "Consent Unknown",
      emails: [email],
      phones: [],
      source: "manual",
      sourceSystem: "manual",
      createdByUserId: user.id,
    });
    await ensureTenantContactLink(tx, { tenantId: tenant.id, contactId: contact.contactId, createdByUserId: user.id });
    return contact;
  });

  assert.ok(created.contactId > 0);

  const list = await listTenantContacts({ tenantId: tenant.id, q: email, consent: "all", limit: 50, offset: 0 });
  assert.ok(list.items.some((item) => item.primaryEmail === email));
  assert.ok(list.items.find((item) => item.primaryEmail === email)?.consentStatus);
});

test("Tenant contacts: multi-tenant isolation via tenant_contacts join", async () => {
  const tenantA = await createTenant();
  const userA = await createUser();
  await attachUserToTenant(tenantA.id, userA.id);

  const tenantB = await createTenant();
  const userB = await createUser();
  await attachUserToTenant(tenantB.id, userB.id);

  const email = `shared.${nanoid(8)}@example.com`.toLowerCase();

  const contact = await db.transaction(async (tx) => {
    const created = await upsertCanonicalContact(tx, {
      displayName: "Shared Contact",
      emails: [email],
      phones: [],
      source: "manual",
      sourceSystem: "manual",
      createdByUserId: userA.id,
    });
    await ensureTenantContactLink(tx, { tenantId: tenantA.id, contactId: created.contactId, createdByUserId: userA.id });
    return created;
  });

  const listA = await listTenantContacts({ tenantId: tenantA.id, q: email, limit: 50, offset: 0 });
  assert.ok(listA.items.some((item) => item.primaryEmail === email));

  const listBBefore = await listTenantContacts({ tenantId: tenantB.id, q: email, limit: 50, offset: 0 });
  assert.ok(!listBBefore.items.some((item) => item.primaryEmail === email));

  await db.transaction(async (tx) => {
    await ensureTenantContactLink(tx, { tenantId: tenantB.id, contactId: contact.contactId, createdByUserId: userB.id });
  });

  const listBAfter = await listTenantContacts({ tenantId: tenantB.id, q: email, limit: 50, offset: 0 });
  assert.ok(listBAfter.items.some((item) => item.primaryEmail === email));
});
