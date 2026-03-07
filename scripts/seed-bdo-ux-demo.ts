import { desc, eq } from "drizzle-orm";
import { db } from "@db";
import {
  bdoGoldAcquisitionRecords,
  bdoVirtualVaults,
  bdoVaultGoldUnits,
  eceUsers,
  goldWalletTransactions,
  traderWallets,
} from "@db/schema";

function getArgValue(flag: string) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function truthyEnv(value: unknown) {
  return ["1", "true", "yes", "y", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeWalletCurrency(raw: unknown) {
  const value = String(raw || "")
    .trim()
    .toUpperCase();
  if (value === "USD" || value === "EUR" || value === "AED" || value === "XOF" || value === "USDT") return value;
  return "XOF";
}

function balanceFieldForCurrency(currency: string) {
  const curr = normalizeWalletCurrency(currency);
  return `balance${curr.charAt(0).toUpperCase() + curr.slice(1).toLowerCase()}`;
}

function parsePositiveNumber(raw: unknown, fallback: number) {
  const n = Number.parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

async function ensureWallet(userId: number, primaryCurrency: string) {
  let wallet = await db.query.traderWallets.findFirst({
    where: eq(traderWallets.userId, userId),
  });

  if (!wallet) {
    const [created] = await db
      .insert(traderWallets)
      .values({
        userId,
        primaryCurrency: normalizeWalletCurrency(primaryCurrency),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();
    wallet = created;
  }

  return wallet;
}

async function ensureVault(userId: number) {
  let vault = await db.query.bdoVirtualVaults.findFirst({
    where: eq(bdoVirtualVaults.ownerUserId, userId),
  });

  if (!vault) {
    const [created] = await db
      .insert(bdoVirtualVaults)
      .values({
        ownerUserId: userId,
        custodyLocation: "virtual_vault",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();
    vault = created;
  }

  return vault;
}

async function seedDeposit(args: { walletId: number; currency: string; amount: number; reference: string }) {
  const currency = normalizeWalletCurrency(args.currency);
  const wallet = await db.query.traderWallets.findFirst({ where: eq(traderWallets.id, args.walletId) });
  if (!wallet) throw new Error(`Wallet not found: ${args.walletId}`);

  const field = balanceFieldForCurrency(currency);
  const currentBalance = parseFloat(((wallet as any)[field] as string) || "0");
  const nextBalance = currentBalance + args.amount;

  await db
    .update(traderWallets)
    .set({
      [field]: nextBalance.toFixed(4),
      updatedAt: new Date(),
    } as any)
    .where(eq(traderWallets.id, wallet.id));

  await db.insert(goldWalletTransactions).values({
    walletId: wallet.id,
    type: "deposit",
    direction: "credit",
    amount: args.amount.toFixed(4),
    currency: currency as any,
    balanceBefore: currentBalance.toFixed(4),
    balanceAfter: nextBalance.toFixed(4),
    paymentMethod: "ux_demo_seed",
    externalReference: args.reference,
    status: "completed",
    completedAt: new Date(),
    metadata: { seed: true, createdBy: "ux_demo_seed" },
  } as any);

  return { field, currentBalance, nextBalance };
}

async function seedVaultUnits(args: {
  userId: number;
  vaultId: number;
  currency: string;
  pricePerGram: number;
  seedId: string;
  force: boolean;
}) {
  const existing = await db.query.bdoVaultGoldUnits.findMany({
    where: eq(bdoVaultGoldUnits.vaultId, args.vaultId),
    columns: { id: true, metadata: true },
    orderBy: [desc(bdoVaultGoldUnits.createdAt)],
  });

  const alreadySeeded = existing.some((u) => (u as any)?.metadata?.createdBy === "ux_demo_seed");
  if (alreadySeeded && !args.force) {
    console.log("[seed-bdo-ux-demo] Vault already has demo units. Re-run with --force to add more.");
    return { created: 0, skipped: true };
  }

  const now = new Date();
  const units = [
    { label: "5g 18K Standard", unitSizeGrams: 5, count: 10, karat: 18, edition: "Standard", kind: "ingot" as const, deliveryStatus: "created", lockupDays: 0 },
    { label: "10g 18K Standard", unitSizeGrams: 10, count: 8, karat: 18, edition: "Standard", kind: "ingot" as const, deliveryStatus: "created", lockupDays: 0 },
    { label: "20g 18K Investor", unitSizeGrams: 20, count: 5, karat: 18, edition: "Investor", kind: "ingot" as const, deliveryStatus: "created", lockupDays: 14 },
    { label: "50g 18K Heritage", unitSizeGrams: 50, count: 4, karat: 18, edition: "Heritage", kind: "ingot" as const, deliveryStatus: "created", lockupDays: 30 },
    { label: "100g 24K Dubai", unitSizeGrams: 100, count: 2, karat: 24, edition: "Dubai", kind: "ingot" as const, deliveryStatus: "created", lockupDays: 45 },
    { label: "10g Collector Coin", unitSizeGrams: 10, count: 6, karat: 18, edition: "Collector Coin", kind: "coin" as const, deliveryStatus: "created", lockupDays: 0 },
  ];

  let created = 0;
  for (const u of units) {
    for (let index = 0; index < u.count; index++) {
      const lockupEndDate =
        u.lockupDays > 0 ? new Date(Date.now() + u.lockupDays * 24 * 60 * 60 * 1000) : null;
      const totalPrice = u.unitSizeGrams * args.pricePerGram;

      const [acq] = await db
        .insert(bdoGoldAcquisitionRecords)
        .values({
          userId: args.userId,
          unitSizeGrams: u.unitSizeGrams,
          purity: u.karat === 24 ? "0.9999" : "0.7500",
          timestamp: now,
          pricePerGram: args.pricePerGram.toFixed(6),
          totalPrice: totalPrice.toFixed(4),
          currency: normalizeWalletCurrency(args.currency),
          pricingSnapshotId: null,
          allocatedLotIds: [],
          proofDocs: [],
          custodyLocation: "virtual_vault",
          lockupEndDate,
          status: "stored",
          metadata: {
            seed: true,
            seedId: args.seedId,
            label: u.label,
            createdBy: "ux_demo_seed",
            karat: u.karat,
            editionType: u.edition,
            productType: u.kind,
            unitIndex: index + 1,
            jewelryConversionEligible: u.kind === "ingot",
            vaultEligible: true,
          },
          createdAt: now,
        } as any)
        .returning();

      await db
        .insert(bdoVaultGoldUnits)
        .values({
          vaultId: args.vaultId,
          acquisitionId: acq?.id ?? null,
          unitSizeGrams: u.unitSizeGrams,
          purity: u.karat === 24 ? "0.9999" : "0.7500",
          status: "stored",
          lockupEndDate,
          deliveryStatus: u.deliveryStatus,
          metadata: {
            seed: true,
            seedId: args.seedId,
            label: `${u.label} #${index + 1}`,
            createdBy: "ux_demo_seed",
            karat: u.karat,
            editionType: u.edition,
            productType: u.kind,
            jewelryConversionEligible: u.kind === "ingot",
            vaultEligible: true,
          },
          createdAt: now,
          updatedAt: now,
        } as any)
        .returning();

      created++;
    }
  }

  console.log(`[seed-bdo-ux-demo] Seeded ${created} vault units.`);
  return { created, skipped: false };
}

async function main() {
  if (!truthyEnv(process.env.ALLOW_UX_SEED)) {
    console.error("[seed-bdo-ux-demo] Refusing to run. Set ALLOW_UX_SEED=true to proceed.");
    process.exit(1);
  }

  const isProd = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const allowProd = process.argv.includes("--allow-production");
  if (isProd && !allowProd) {
    console.error("[seed-bdo-ux-demo] Refusing to run with NODE_ENV=production. Add --allow-production if you really intend this.");
    process.exit(1);
  }

  const email = String(getArgValue("--email") || "").trim().toLowerCase();
  const userIdArg = getArgValue("--user-id");
  const userId = userIdArg ? Number.parseInt(String(userIdArg), 10) : null;

  if (!email && !userId) {
    console.error("[seed-bdo-ux-demo] Missing target user. Provide --email or --user-id.");
    process.exit(1);
  }

  const currency = normalizeWalletCurrency(getArgValue("--currency") || process.env.UX_SEED_CURRENCY || "XOF");
  const depositAmount = parsePositiveNumber(getArgValue("--deposit") || process.env.UX_SEED_DEPOSIT, 25_000_000);
  const pricePerGram = parsePositiveNumber(getArgValue("--price-per-gram") || process.env.UX_SEED_PRICE_PER_GRAM, 74_000);
  const force = process.argv.includes("--force");

  const seedId = `uxdemo_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  const user = email
    ? await db.query.eceUsers.findFirst({ where: eq(eceUsers.email, email) })
    : userId
      ? await db.query.eceUsers.findFirst({ where: eq(eceUsers.id, userId) })
      : null;

  if (!user) {
    console.error(`[seed-bdo-ux-demo] User not found: ${email || userId}`);
    process.exit(1);
  }

  const wallet = await ensureWallet(user.id, currency);
  const vault = await ensureVault(user.id);

  const deposit = await seedDeposit({ walletId: wallet.id, currency, amount: depositAmount, reference: seedId });
  const units = await seedVaultUnits({
    userId: user.id,
    vaultId: vault.id,
    currency,
    pricePerGram,
    seedId,
    force,
  });

  console.log(
    [
      "",
      "[seed-bdo-ux-demo] Done.",
      `- user: ${user.email} (id=${user.id})`,
      `- wallet: id=${wallet.id} +${depositAmount} ${currency} (field ${deposit.field} ${deposit.currentBalance.toFixed(4)} -> ${deposit.nextBalance.toFixed(4)})`,
      `- vault: id=${vault.id} unitsCreated=${units.created}${units.skipped ? " (skipped)" : ""}`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("[seed-bdo-ux-demo] Failed:", err);
  process.exit(1);
});
