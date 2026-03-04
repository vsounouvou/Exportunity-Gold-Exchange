import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminWalletConfigPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Wallet Config</h1>
        <p className="text-gray-400">Fees/limits are currently env-configured (MVP).</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-lg">Environment variables</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-white/70 space-y-2">
          <div>`WALLET_CURRENCY` (default: XOF)</div>
          <div>`PAYOUT_MIN_XOF` (default: 10000)</div>
          <div>`PAYOUT_FEE_FIXED_XOF` (default: 500)</div>
          <div>`PAYOUT_FEE_PCT` (default: 0.02)</div>
          <div>`PAYOUT_COOLDOWN_MINUTES` (default: 0)</div>
          <div>`VOUCHER_CODE_SALT` (recommended)</div>
          <div>`KIKI_MODE_*` (SANDBOX|LIVE)</div>
          <div>`KIKI_PUBLIC_KEY_BOURSE_[LIVE|SANDBOX]` / `KIKI_PUBLIC_KEY_EXPORTUNITY_[LIVE|SANDBOX]`</div>
          <div>`KKIAPAY_PUBLIC_KEY_*` (alias; same suffix rules)</div>
          <div>`KIKI_PAYOUT_BASE_URL` / `KIKI_PAYOUT_INIT_PATH` / `KIKI_PAYOUT_VERIFY_PATH`</div>
          <div>`KIKI_PAYOUT_VERIFY_ENABLED=true|false`</div>
        </CardContent>
      </Card>
    </div>
  );
}
