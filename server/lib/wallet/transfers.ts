import { transferWallet } from "./ledger";

export async function createWalletTransfer(input: {
  fromWalletAccountId: string;
  toWalletAccountId: string;
  amount: number;
  memo?: string | null;
  metadata?: Record<string, any>;
}) {
  return transferWallet({
    fromWalletAccountId: input.fromWalletAccountId,
    toWalletAccountId: input.toWalletAccountId,
    amount: input.amount,
    memo: input.memo ?? null,
    metadata: input.metadata,
  });
}

