import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Trash2, UserPlus } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type CreateResponse = {
  ok: boolean;
  proUrl: string;
  credentials: { email: string; tempPassword: string };
  user: {
    id: number;
    displayName: string;
    email: string;
    roles: string[];
    currentMode?: string | null;
    language?: string;
    currency?: string;
    companyName?: string;
    companyType?: string;
  };
  seeded?: {
    seedKey: string;
    sellerId?: number;
    productIds?: number[];
    orderIds?: number[];
    messageIds?: number[];
  };
};

type DeleteResponse = {
  ok: boolean;
  seedKey: string | null;
  deleted: { seller: number; products: number; orders: number; orderItems?: number; messages: number };
};

export default function AdminProTestAccountPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    companyName: "",
    companyType: "jewellery_store",
    role: "shop_owner",
    language: "fr",
    currency: "XOF",
  });
  const [result, setResult] = useState<CreateResponse | null>(null);

  const canSubmit = useMemo(() => {
    if (!form.fullName.trim()) return false;
    if (!form.email.trim()) return false;
    if (!form.companyName.trim()) return false;
    return true;
  }, [form.companyName, form.email, form.fullName]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        companyName: form.companyName.trim(),
        companyType: form.companyType,
        roles: [form.role],
        language: form.language,
        currency: form.currency,
      };
      return (await apiRequest("/api/admin/pro-test-accounts", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as CreateResponse;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: "Test account created", description: "Credentials are ready to copy." });
    },
    onError: (error: any) => {
      toast({
        title: "Create failed",
        description: error?.message || "Could not create test account",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const userId = result?.user?.id;
      if (!userId) throw new Error("Missing userId");
      return (await apiRequest(`/api/admin/pro-test-accounts/${encodeURIComponent(String(userId))}/delete-demo-data`, {
        method: "POST",
        body: JSON.stringify({}),
      })) as DeleteResponse;
    },
    onSuccess: (data) => {
      toast({
        title: "Demo data deleted",
        description: `Orders: ${data.deleted.orders}, products: ${data.deleted.products}, messages: ${data.deleted.messages}`,
      });
      setResult((prev) => (prev ? { ...prev, seeded: undefined } : prev));
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error?.message || "Could not delete demo data", variant: "destructive" });
    },
  });

  const copyCredentials = async () => {
    if (!result) return;
    const text = [
      `Pro URL: ${result.proUrl}`,
      `Email: ${result.credentials.email}`,
      `Password: ${result.credentials.tempPassword}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Credentials copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard not available.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Create Pro Test Account</h1>
        <p className="mt-1 text-sm text-white/60">
          Creates an ECE user + lightweight demo data (products, orders, one customer message). Use for onboarding and QA.
        </p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <UserPlus className="h-5 w-5 text-amber-400" />
            Inputs
          </CardTitle>
          <CardDescription>Defaults match the urgent request (FR + XOF + jewellery store owner).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-white/80">Full name</Label>
            <Input
              value={form.fullName}
              onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
              className="bg-white/5 border-white/10 text-white"
              placeholder="e.g. President Name"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Email</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="bg-white/5 border-white/10 text-white"
              placeholder="name@company.com"
              inputMode="email"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Phone (optional)</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="bg-white/5 border-white/10 text-white"
              placeholder="+225 01 23 45 67 89"
              inputMode="tel"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Company name</Label>
            <Input
              value={form.companyName}
              onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              className="bg-white/5 border-white/10 text-white"
              placeholder="e.g. Association des Bijoutiers"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/80">Company type</Label>
            <select
              value={form.companyType}
              onChange={(e) => setForm((p) => ({ ...p, companyType: e.target.value }))}
              className="h-10 w-full rounded-md bg-white/5 border border-white/10 text-white/90 px-3"
            >
              <option value="jewellery_store">jewellery_store</option>
              <option value="mine">mine</option>
              <option value="trader">trader</option>
              <option value="other">other</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-white/80">Role</Label>
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              className="h-10 w-full rounded-md bg-white/5 border border-white/10 text-white/90 px-3"
            >
              <option value="shop_owner">shop_owner</option>
              <option value="mine_operator">mine_operator</option>
              <option value="mine_owner">mine_owner</option>
              <option value="seller">seller</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-white/80">Language</Label>
            <select
              value={form.language}
              onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}
              className="h-10 w-full rounded-md bg-white/5 border border-white/10 text-white/90 px-3"
            >
              <option value="fr">fr</option>
              <option value="en">en</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-white/80">Currency</Label>
            <select
              value={form.currency}
              onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
              className="h-10 w-full rounded-md bg-white/5 border border-white/10 text-white/90 px-3"
            >
              <option value="XOF">XOF</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2">
            <Button
              className={cn("bg-amber-500 text-black hover:bg-amber-400", !canSubmit && "opacity-60")}
              disabled={!canSubmit || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating..." : "Create test account"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Copy credentials</CardTitle>
            <CardDescription>Send these to the tester. Password login is the primary method.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/80 space-y-2">
              <div>
                <span className="text-white/50">Pro URL:</span> <span className="font-mono">{result.proUrl}</span>
              </div>
              <div>
                <span className="text-white/50">Email:</span> <span className="font-mono">{result.credentials.email}</span>
              </div>
              <div>
                <span className="text-white/50">Password:</span>{" "}
                <span className="font-mono">{result.credentials.tempPassword}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="border-white/15 text-white/85" onClick={copyCredentials}>
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
              <Button
                variant="outline"
                className="border-red-400/40 text-red-200 hover:bg-red-500/10"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete demo data
              </Button>
            </div>

            {result.seeded ? (
              <div className="text-xs text-white/55">
                Seed key: <span className="font-mono text-white/70">{result.seeded.seedKey}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

