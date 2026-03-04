function envInt(name: string, fallback: number) {
  const raw = String(process.env[name] ?? "").trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envFloat(name: string, fallback: number) {
  const raw = String(process.env[name] ?? "").trim();
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envString(name: string, fallback: string) {
  const raw = String(process.env[name] ?? "").trim();
  return raw || fallback;
}

export const WALLET_CURRENCY = envString("WALLET_CURRENCY", "XOF");

export const PAYOUT_MIN_XOF = envInt("PAYOUT_MIN_XOF", 10_000);
export const PAYOUT_FEE_FIXED_XOF = envInt("PAYOUT_FEE_FIXED_XOF", 500);
export const PAYOUT_FEE_PCT = envFloat("PAYOUT_FEE_PCT", 0.02);
export const PAYOUT_COOLDOWN_MINUTES = envInt("PAYOUT_COOLDOWN_MINUTES", 0);

export function computePayoutFee(amountXof: number) {
  const pctFee = Math.round(Math.max(0, amountXof) * Math.max(0, PAYOUT_FEE_PCT));
  const feeAmount = Math.max(PAYOUT_FEE_FIXED_XOF, pctFee);
  const netAmount = amountXof;
  const totalDebit = amountXof + feeAmount;
  return { feeAmount, netAmount, totalDebit };
}

