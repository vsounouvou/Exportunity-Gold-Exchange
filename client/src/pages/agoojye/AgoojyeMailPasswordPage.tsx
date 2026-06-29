import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type PasswordChangePayload = {
  email: string;
  currentPassword: string;
  newPassword: string;
};

type PasswordChangeResponse = {
  ok: boolean;
  message?: string;
  webmailUrl?: string;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export default function AgoojyeMailPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [webmailUrl, setWebmailUrl] = useState("https://mail.exportunity.net/");

  useEffect(() => {
    document.title = "Mot de passe email - AGOOJIYE";
  }, []);

  const mutation = useMutation({
    mutationFn: async (payload: PasswordChangePayload) =>
      apiRequest("/api/mail/password/change", "POST", payload) as Promise<PasswordChangeResponse>,
    onSuccess: (payload) => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (payload?.webmailUrl) setWebmailUrl(payload.webmailUrl);
      toast({
        title: "Mot de passe mis à jour",
        description: "Vous pouvez maintenant ouvrir le webmail AGOOJIYE.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Changement refusé",
        description: error?.message || "Vérifiez l'adresse et le mot de passe actuel.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.endsWith("@agoojiye.com")) {
      toast({
        title: "Adresse invalide",
        description: "Utilisez votre adresse officielle @agoojiye.com.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 12) {
      toast({
        title: "Mot de passe trop court",
        description: "Utilisez au moins 12 caractères.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Confirmation différente",
        description: "Les deux nouveaux mots de passe doivent être identiques.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate({ email: cleanEmail, currentPassword, newPassword });
  };

  return (
    <main className="min-h-screen bg-[#080808] text-[#F7F2E8]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="h-full w-full bg-[radial-gradient(circle_at_20%_0%,rgba(201,154,54,0.20),transparent_28%),linear-gradient(135deg,#080808_0%,#123C2F_48%,#080808_100%)]" />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
        <header className="flex items-center justify-between gap-4">
          <a href="/" aria-label="AGOOJIYE accueil" className="flex items-center gap-3">
            <img
              src="/tenants/agoojye/logo-wordmark.png"
              alt="AGOOJIYE"
              width={930}
              height={200}
              className="h-10 w-auto max-w-[190px] object-contain sm:max-w-[240px]"
            />
          </a>
          <a
            href="/"
            className="rounded border border-[#C99A36]/40 px-3 py-2 text-sm font-semibold text-[#E4C46A] hover:bg-[#C99A36]/10"
          >
            Accueil
          </a>
        </header>

        <section className="grid flex-1 items-center gap-6 py-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 border border-[#C99A36]/35 bg-black/35 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#E4C46A]">
              <ShieldCheck className="h-4 w-4" />
              Email officiel AGOOJIYE
            </div>
            <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl">
              Changer le mot de passe de votre boîte email
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#D8CFBF]">
              Entrez votre adresse @agoojiye.com, votre mot de passe initial, puis choisissez un nouveau mot de passe.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-[#D8CFBF] sm:grid-cols-2">
              <div className="border border-white/10 bg-black/35 p-4">
                <Mail className="mb-3 h-5 w-5 text-[#C99A36]" />
                <div className="font-semibold text-white">Webmail</div>
                <a
                  href={webmailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[#E4C46A] hover:text-white"
                >
                  Ouvrir Roundcube <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="border border-white/10 bg-black/35 p-4">
                <LockKeyhole className="mb-3 h-5 w-5 text-[#C99A36]" />
                <div className="font-semibold text-white">Sécurité</div>
                <p className="mt-1">Aucun mot de passe email n'est stocké dans la plateforme.</p>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="border border-[#C99A36]/30 bg-[#0E0E0E]/92 p-5 shadow-2xl shadow-black/40 sm:p-6">
            <div className="mb-6">
              <div className="text-lg font-bold text-white">Mot de passe email</div>
              <p className="mt-1 text-sm text-[#AFA798]">Le mot de passe actuel est vérifié avant toute modification.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ag-email" className="text-[#F7F2E8]">
                  Adresse email
                </Label>
                <Input
                  id="ag-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="prenom@agoojiye.com"
                  autoComplete="email"
                  className="border-white/15 bg-black/45 text-white placeholder:text-[#8C8475]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ag-current-password" className="text-[#F7F2E8]">
                  Mot de passe actuel
                </Label>
                <Input
                  id="ag-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  className="border-white/15 bg-black/45 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ag-new-password" className="text-[#F7F2E8]">
                  Nouveau mot de passe
                </Label>
                <Input
                  id="ag-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={12}
                  autoComplete="new-password"
                  className="border-white/15 bg-black/45 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ag-confirm-password" className="text-[#F7F2E8]">
                  Confirmer le nouveau mot de passe
                </Label>
                <Input
                  id="ag-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={12}
                  autoComplete="new-password"
                  className="border-white/15 bg-black/45 text-white"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="mt-6 w-full bg-[#C99A36] font-bold text-black hover:bg-[#E4C46A]"
            >
              <LockKeyhole className="mr-2 h-4 w-4" />
              {mutation.isPending ? "Mise à jour..." : "Mettre à jour"}
            </Button>

            {mutation.isSuccess ? (
              <div className="mt-4 border border-emerald-400/35 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                Mot de passe changé. Vous pouvez vous connecter au webmail avec le nouveau mot de passe.
              </div>
            ) : null}
          </form>
        </section>
      </div>
    </main>
  );
}
