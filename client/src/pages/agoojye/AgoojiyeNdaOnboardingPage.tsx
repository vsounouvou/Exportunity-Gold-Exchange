import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  UploadCloud,
} from "lucide-react";
import { Redirect, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useSession } from "@/lib/session";

type NdaStatusPayload = {
  ok: true;
  displayName: string;
  corporateEmail: string;
  ndaRegistered: boolean;
  ndaAccessState: string;
  accessAllowed: boolean;
  document: {
    originalName: string;
    mimeType: string;
    byteSize: number;
    status: string;
    submittedAt: string;
  } | null;
  upload: {
    acceptedMimeTypes: string[];
    maxBytes: number;
  };
};

async function ndaRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      payload?.message || "La demande n'a pas pu être traitée.",
    ) as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  return payload as T;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Ko";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function AgoojiyeNdaOnboardingPage() {
  const { isAuthenticated, isGuest, token, user, logout } = useSession();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    document.title = "Dépôt du NDA signé | AGOOJIYE";
  }, []);

  const status = useQuery<NdaStatusPayload>({
    queryKey: ["/api/agoojye/onboarding/nda"],
    queryFn: () =>
      ndaRequest<NdaStatusPayload>(
        String(token || ""),
        "/api/agoojye/onboarding/nda",
      ),
    enabled:
      isAuthenticated &&
      !isGuest &&
      Boolean(token) &&
      user?.sessionScope === "agoojye_nda",
    retry: false,
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Sélectionnez votre NDA signé.");
      const maxBytes = status.data?.upload.maxBytes || 10 * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error(
          `Le fichier dépasse la limite de ${formatFileSize(maxBytes)}.`,
        );
      }
      if (!confirmed) {
        throw new Error("Confirmez que ce document est votre NDA signé.");
      }
      const body = new FormData();
      body.set("file", file);
      return ndaRequest<{ ok: true; redirect: string }>(
        String(token || ""),
        "/api/agoojye/onboarding/nda",
        { method: "POST", body },
      );
    },
    onSuccess: (payload) => {
      toast({
        title: "NDA reçu",
        description:
          "Votre accès est maintenant ouvert. Reconnectez-vous avec votre adresse AGOOJIYE.",
      });
      logout();
      setLocation(payload.redirect || "/workspace/connexion");
    },
    onError: (error: any) => {
      toast({
        title: "Dépôt impossible",
        description: error?.message || "Vérifiez le fichier puis réessayez.",
        variant: "destructive",
      });
    },
  });

  if (!isAuthenticated || isGuest) {
    return <Redirect to="/workspace/connexion" />;
  }
  if (user?.sessionScope !== "agoojye_nda") {
    return <Redirect to="/workspace" />;
  }

  const expired = status.isError;
  const registered = status.data?.ndaRegistered !== false;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    upload.mutate();
  };

  return (
    <main className="min-h-screen bg-[#101311] text-white">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[0.8fr_1.2fr]">
        <section className="flex flex-col justify-between border-b border-white/10 px-5 py-7 sm:px-9 lg:border-b-0 lg:border-r lg:px-12 lg:py-12">
          <a href="/" aria-label="Accueil AGOOJIYE" className="w-fit">
            <img
              src="/brand/agoojiye/logo/AGOOJIYE_logo_horizontal_transparent.png"
              alt="AGOOJIYE"
              className="h-10 w-auto sm:h-12"
            />
          </a>
          <div className="py-10 lg:py-16">
            <span className="grid h-12 w-12 place-items-center bg-[#d8ad3d] text-[#17140c]">
              <LockKeyhole className="h-6 w-6" />
            </span>
            <p className="mt-7 text-xs font-bold uppercase text-[#d8ad3d]">
              Accès confidentiel
            </p>
            <h1 className="mt-3 max-w-md text-3xl font-semibold sm:text-4xl">
              Ajoutez votre NDA signé avant d’ouvrir votre espace.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-white/60">
              Ce document est conservé dans un espace privé et chiffré. Il
              n’est accessible qu’aux administrateurs autorisés.
            </p>
          </div>
          <p className="text-xs leading-5 text-white/35">
            Besoin d’aide ? Écrivez à support@agoojiye.com depuis votre adresse
            personnelle.
          </p>
        </section>

        <section className="flex items-center px-5 py-10 sm:px-9 lg:px-14">
          <div className="w-full max-w-2xl">
            {status.isLoading ? (
              <div className="border border-white/10 bg-white/[0.04] p-7">
                <div className="h-5 w-44 animate-pulse bg-white/10" />
                <div className="mt-4 h-12 animate-pulse bg-white/[0.06]" />
              </div>
            ) : expired ? (
              <div className="border-l-4 border-red-400 bg-red-950/25 p-6">
                <AlertTriangle className="h-7 w-7 text-red-300" />
                <h2 className="mt-4 text-xl font-semibold">
                  Session de dépôt expirée
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Reconnectez-vous pour obtenir une nouvelle session limitée au
                  dépôt de votre NDA.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    logout();
                    setLocation("/workspace/connexion");
                  }}
                  className="mt-5 h-11 bg-white text-black hover:bg-white/90"
                >
                  Revenir à la connexion
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : !registered ? (
              <div className="border-l-4 border-amber-400 bg-amber-950/20 p-6">
                <AlertTriangle className="h-7 w-7 text-amber-300" />
                <h2 className="mt-4 text-xl font-semibold">
                  Enregistrement administratif requis
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Votre dossier NDA doit d’abord être marqué comme enregistré
                  par l’administration AGOOJIYE.
                </p>
              </div>
            ) : status.data?.accessAllowed &&
              status.data?.document?.status !== "rejected" ? (
              <div className="border-l-4 border-emerald-400 bg-emerald-950/20 p-6">
                <CheckCircle2 className="h-7 w-7 text-emerald-300" />
                <h2 className="mt-4 text-xl font-semibold">
                  Votre NDA a déjà été reçu
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Reconnectez-vous pour ouvrir votre espace de travail.
                </p>
              </div>
            ) : (
              <form
                className="border border-white/10 bg-white/[0.04] p-5 sm:p-7"
                onSubmit={submit}
              >
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center bg-white/10">
                    <FileCheck2 className="h-5 w-5 text-[#e5be56]" />
                  </span>
                  <div>
                    <h2 className="text-xl font-semibold">
                      Votre document signé
                    </h2>
                    <p className="mt-1 text-sm text-white/50">
                      {status.data?.displayName} ·{" "}
                      {status.data?.corporateEmail}
                    </p>
                  </div>
                </div>

                <div className="mt-7">
                  <p id="nda-file-label" className="text-sm font-medium text-white">
                    Fichier PDF, JPG ou PNG
                  </p>
                  <Input
                    id="nda-file"
                    type="file"
                    aria-labelledby="nda-file-label"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    required
                    onChange={(event) =>
                      setFile(event.target.files?.[0] || null)
                    }
                    className="sr-only"
                  />
                  <label
                    htmlFor="nda-file"
                    className="mt-2 inline-flex min-h-12 cursor-pointer items-center justify-center bg-[#d8ad3d] px-4 text-sm font-bold text-[#17140c] hover:bg-[#ebc75e] focus-within:outline-none focus-within:ring-2 focus-within:ring-white"
                  >
                    <UploadCloud className="mr-2 h-5 w-5" />
                    Choisir un fichier
                  </label>
                  <p className="mt-2 text-xs text-white/40">
                    Taille maximale :{" "}
                    {formatFileSize(
                      status.data?.upload.maxBytes || 10 * 1024 * 1024,
                    )}
                  </p>
                  {file ? (
                    <p className="mt-3 border-l-2 border-[#d8ad3d] pl-3 text-sm text-white/70">
                      {file.name} · {formatFileSize(file.size)}
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 flex items-start gap-3">
                  <Checkbox
                    id="nda-confirmation"
                    checked={confirmed}
                    onCheckedChange={(value) => setConfirmed(value === true)}
                    className="mt-0.5 border-white/40 data-[state=checked]:border-[#d8ad3d] data-[state=checked]:bg-[#d8ad3d] data-[state=checked]:text-black"
                  />
                  <Label
                    htmlFor="nda-confirmation"
                    className="cursor-pointer text-sm leading-6 text-white/70"
                  >
                    Je confirme que ce fichier est mon NDA signé et que je suis
                    autorisé à le transmettre à AGOOJIYE.
                  </Label>
                </div>

                <Button
                  type="submit"
                  disabled={!file || !confirmed || upload.isPending}
                  className="mt-7 h-12 w-full bg-[#d8ad3d] font-bold text-[#17140c] hover:bg-[#ebc75e]"
                >
                  <UploadCloud className="mr-2 h-5 w-5" />
                  {upload.isPending
                    ? "Envoi sécurisé…"
                    : "Déposer le NDA signé"}
                </Button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
