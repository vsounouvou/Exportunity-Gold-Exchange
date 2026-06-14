import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, CheckCircle2, Clock, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { ChatFormWizard, type ChatWizardStep } from "@/components/ChatFormWizard";
import { CountryCombobox } from "@/components/CountryCombobox";
import { getSuggestedCountryCode } from "@/lib/countries";
import { BrandLockup, InstitutionFooter } from "@pkg/branding";
import { useTenant } from "@/lib/tenant";
import { resolveApiUrl } from "@/lib/runtimeConfig";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocale } from "@/contexts/LocaleContext";

const loginSchema = z.object({
  email: z.string().email("Entrez une adresse email valide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caracteres")
});

type LoginFormData = z.infer<typeof loginSchema>;

type ApplyRole =
  | "gold_miner"
  | "authorized_gold_buyer"
  | "jewelry"
  | "machinery_manufacturer"
  | "machinery_reseller"
  | "investor"
  | "";
type YesNotNow = "yes" | "not_now" | "";
type MineSubtype = "artisanal" | "semi_industrial" | "industrial" | "";
type JewelrySubtype = "manufacturer" | "reseller" | "";
type InvestorInterest = "mines" | "machinery" | "both" | "";

type ApplicationAnswers = {
  contact: string;
  fullName: string;
  role: ApplyRole;
  mineSubtype: MineSubtype;
  jewelrySubtype: JewelrySubtype;
  country: string;
  stateRegion: string;
  city: string;
  address: string;
  postalCode: string;
  licenseUploadNow: YesNotNow;
  licenseNumber: string;
  sellOnPlatform: YesNotNow;
  investmentRange: string;
  investorInterest: InvestorInterest;
};

function getLoginPageCopy(language: string) {
  if (language === "ar") {
    return {
      accessTitle: "الدخول إلى BOURSE DE L'OR",
      accessDescription: "سجّل الدخول أو أنشئ حساباً. كل طلب مهني يخضع للمراجعة عند الحاجة.",
      signIn: "تسجيل الدخول",
      requestAccess: "طلب الوصول",
      signingIn: "جار تسجيل الدخول...",
      email: "البريد الإلكتروني",
      emailPlaceholder: "you@company.com",
      password: "كلمة المرور",
      close: "إغلاق",
      loginSuccess: "تم تسجيل الدخول",
      signedInAs: "تم الدخول باسم",
      loginError: "تعذر تسجيل الدخول",
      invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      welcomeTitle: (brandName: string) => `مرحباً بك في ${brandName}. لننشئ حسابك.`,
      welcomeDescription: "يتم تنظيم طلب الوصول حتى يمكن إجراء مراجعة بشرية عند الحاجة.",
      submitApplication: "إرسال الطلب",
      submittedTitle: "تم إرسال الطلب",
      submittedBody: "ملفك قيد المراجعة من فريق BOURSE DE L'OR.",
      requestReference: "مرجع الطلب",
      nextSteps: "الخطوات التالية",
      step1: "مراجعة المعلومات والوثائق المرسلة.",
      step2: "تصعيد بشري إذا كانت هناك حاجة إلى تأكيد إضافي.",
      step3: "إشعار عند الموافقة على الوصول أو طلب معلومات إضافية.",
      back: "رجوع",
      trackApplication: "متابعة الملف",
    };
  }

  if (language === "en") {
    return {
      accessTitle: "Access BOURSE DE L'OR",
      accessDescription: "Sign in or create an account. Professional access requests can be escalated to human review.",
      signIn: "Sign in",
      requestAccess: "Request access",
      signingIn: "Signing in...",
      email: "Email",
      emailPlaceholder: "you@company.com",
      password: "Password",
      close: "Close",
      loginSuccess: "Signed in",
      signedInAs: "Signed in as",
      loginError: "Sign-in failed",
      invalidCredentials: "Invalid email or password",
      welcomeTitle: (brandName: string) => `Welcome to ${brandName}. Let's create your account.`,
      welcomeDescription: "Your access request is structured so it can be reviewed by a human when needed.",
      submitApplication: "Submit request",
      submittedTitle: "Request submitted",
      submittedBody: "Your file is under review by the BOURSE DE L'OR team.",
      requestReference: "Request reference",
      nextSteps: "Next steps",
      step1: "Review of submitted information and documents.",
      step2: "Human escalation if additional confirmation is needed.",
      step3: "Notification when access is approved or more information is required.",
      back: "Back",
      trackApplication: "Track application",
    };
  }

  return {
    accessTitle: "Accéder à BOURSE DE L'OR",
    accessDescription: "Se connecter ou créer un compte. Les demandes professionnelles peuvent passer en revue humaine.",
    signIn: "Se connecter",
    requestAccess: "Demander un accès",
    signingIn: "Connexion...",
    email: "Email",
    emailPlaceholder: "vous@entreprise.com",
    password: "Mot de passe",
    close: "Fermer",
    loginSuccess: "Connexion réussie",
    signedInAs: "Connecté en tant que",
    loginError: "Connexion impossible",
    invalidCredentials: "Email ou mot de passe invalide",
    welcomeTitle: (brandName: string) => `Bienvenue sur ${brandName}. Créons votre compte.`,
    welcomeDescription: "Votre demande d'accès est structurée pour permettre une vérification humaine si nécessaire.",
    submitApplication: "Envoyer la demande",
    submittedTitle: "Demande transmise",
    submittedBody: "Votre dossier est en cours de vérification par l'équipe BOURSE DE L'OR.",
    requestReference: "Référence de demande",
    nextSteps: "Prochaines étapes",
    step1: "Vérification des informations et documents transmis.",
    step2: "Escalade humaine si une confirmation supplémentaire est nécessaire.",
    step3: "Notification lorsque l'accès est approuvé ou qu'un complément est requis.",
    back: "Retour",
    trackApplication: "Suivre le dossier",
  };
}

function getCountryName(code: string): string {
  if (!code) return "";
  const DisplayNames = (Intl as any)?.DisplayNames;
  if (typeof DisplayNames !== "function") return code;
  try {
    const dn = new DisplayNames([navigator.language || "en"], { type: "region" });
    return dn.of(code) || code;
  } catch {
    return code;
  }
}

	function parseContact(raw: string): { email: string | null; phone: string | null } {
	  const value = String(raw || "").trim();
	  if (!value) return { email: null, phone: null };
	  if (value.includes("@")) return { email: value.toLowerCase(), phone: null };
	  return { email: null, phone: value };
	}
	
	function normalizeNext(value: string | null) {
	  const raw = String(value || "").trim();
	  if (!raw) return null;
	  if (!raw.startsWith("/")) return null;
	  if (raw.startsWith("//")) return null;
	  if (raw.includes("://")) return null;
	  return raw;
	}

function getRoleKey(answers: ApplicationAnswers): string {
  switch (answers.role) {
    case "gold_miner":
      return "mine_owner";
    case "authorized_gold_buyer":
      return "authorized_gold_buyer";
    case "jewelry":
      if (answers.jewelrySubtype === "manufacturer") return "jewelry_manufacturer";
      if (answers.jewelrySubtype === "reseller") return "jewelry_reseller";
      return "";
    case "machinery_manufacturer":
      return "machinery_manufacturer";
    case "machinery_reseller":
      return "machinery_reseller";
    case "investor":
      return "investor";
    default:
      return "";
  }
}

function getRoleLabel(answers: ApplicationAnswers): string {
  switch (answers.role) {
    case "gold_miner":
      return "Exploitant aurifere";
    case "authorized_gold_buyer":
      return "Acheteur grossiste autorise";
    case "jewelry":
      if (answers.jewelrySubtype === "manufacturer") return "Bijoutier fabricant";
      if (answers.jewelrySubtype === "reseller") return "Bijoutier revendeur";
      return "Bijoutier";
    case "machinery_manufacturer":
      return "Fabricant d'equipements miniers";
    case "machinery_reseller":
      return "Distributeur d'equipements miniers";
    case "investor":
      return "Acheteur ou partenaire institutionnel";
    default:
      return "";
  }
}

function formatMineSubtype(subtype: MineSubtype): string {
  switch (subtype) {
    case "artisanal":
      return "Artisanal";
    case "semi_industrial":
      return "Semi-industrial";
    case "industrial":
      return "Industrial";
    default:
      return "";
  }
}

function MapTeaser() {
  return (
    <MapContainer
      center={[7.54, -5.55]}
      zoom={6}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      keyboard={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    </MapContainer>
  );
}

	export function ECELoginPage() {
	  const [path, setLocation] = useLocation();
	  const { toast } = useToast();
	  const { login } = useSession();
	  const { brand, tenant } = useTenant();
  const { language } = useLocale();
  const copy = useMemo(() => getLoginPageCopy(language), [language]);
  const isBdoTenant = tenant.key === "bdo";
  const isMobile = useIsMobile();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	  const [activeTab, setActiveTab] = useState<"login" | "apply">(() => (path.split("?")[0] === "/register" ? "apply" : "login"));
	  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
	  const [applicationRef, setApplicationRef] = useState<string>("");

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      return await apiRequest("/api/ece/auth/login", {
        method: "POST",
        body: JSON.stringify(data)
      });
    },
	    onSuccess: (data) => {
	      login(data.token, data.user);
	      const params = new URLSearchParams(path.split("?")[1] || "");
	      const next = normalizeNext(params.get("next"));
	      setLocation(data.user?.mustChangePassword ? "/admin/password" : next || "/");
	      toast({
	        title: copy.loginSuccess,
	        description: `${copy.signedInAs} ${data.user.displayName}`
	      });
	    },
    onError: (error: any) => {
      toast({
        title: copy.loginError,
        description: error.message || copy.invalidCredentials,
        variant: "destructive"
      });
    }
  });

  const initialAnswers = useMemo<ApplicationAnswers>(() => {
    const suggested = getSuggestedCountryCode();
    return {
      contact: "",
      fullName: "",
      role: "",
      mineSubtype: "",
      jewelrySubtype: "",
      country: suggested || "",
      stateRegion: "",
      city: "",
      address: "",
      postalCode: "",
      licenseUploadNow: "",
      licenseNumber: "",
      sellOnPlatform: "",
      investmentRange: "",
      investorInterest: "",
    };
  }, []);

  const applicationSteps = (answers: ApplicationAnswers): ChatWizardStep<ApplicationAnswers>[] => {
    const base: ChatWizardStep<ApplicationAnswers>[] = [
      {
        id: "contact",
        title: "Contact",
        kind: "text",
        field: "contact",
        prompt: "Quel est votre email ou numero de telephone ?",
        placeholder: "name@example.com or +225 01 23 45 67 89",
        validate: (value) => {
          const raw = String(value || "").trim();
          if (!raw) return "Entrez votre email ou numero de telephone.";
          if (raw.includes("@")) {
            const res = z.string().email().safeParse(raw);
            return res.success ? null : "Entrez une adresse email valide.";
          }
          const digits = raw.replace(/[^\d]/g, "");
          if (digits.length < 7) return "Entrez un numero de telephone valide.";
          return null;
        },
      },
      {
        id: "fullName",
        title: "Nom complet",
        kind: "text",
        field: "fullName",
        prompt: "Quel est votre nom complet ?",
        placeholder: "Votre nom complet",
        validate: (value) => (String(value || "").trim().length < 2 ? "Entrez votre nom complet." : null),
      },
      {
        id: "role",
        title: "Profil",
        kind: "cards",
        field: "role",
        prompt: "Quel profil souhaitez-vous rejoindre ?",
        options: [
          {
            value: "gold_miner",
            title: "Exploitant aurifere",
            description: "Operation artisanale, semi-industrielle ou industrielle.",
          },
          {
            value: "authorized_gold_buyer",
            title: "Acheteur grossiste autorise",
            description: "Bureau d'achat ou acheteur avec documents d'autorisation.",
          },
          {
            value: "jewelry",
            title: "Bijoutier",
            description: "Fabricant ou revendeur de bijoux verifies.",
          },
          {
            value: "machinery_manufacturer",
            title: "Fabricant d'equipements",
            description: "Fournisseur d'equipements pour operations auriferes.",
          },
          {
            value: "machinery_reseller",
            title: "Distributeur d'equipements",
            description: "Distribution ou representation d'equipements miniers.",
          },
          {
            value: "investor",
            title: "Acheteur ou institution",
            description: "Interet pour l'achat, la certification ou les partenariats.",
          },
        ],
      },
    ];

    if (!answers.role) return base;

    const countryPrompt = (() => {
      switch (answers.role) {
        case "gold_miner":
          return "Dans quel pays se situe votre operation ?";
        case "authorized_gold_buyer":
          return "Dans quel pays etes-vous autorise ?";
        default:
          return "Pays ?";
      }
    })();

    const location: ChatWizardStep<ApplicationAnswers>[] = [
      {
        id: "country",
        title: "Pays",
        kind: "custom",
        prompt: countryPrompt,
        isComplete: (a) => !!a.country,
        render: ({ answers, setAnswer }) => (
          <CountryCombobox value={answers.country} onChange={(code) => setAnswer("country", code)} />
        ),
      },
      {
        id: "stateRegion",
        title: answers.role === "gold_miner" ? "Region" : "Region",
        kind: "text",
        field: "stateRegion",
        prompt: answers.role === "gold_miner" ? "Quelle region ou localite ?" : "Region ? (optionnel)",
        required: (a) => a.role === "gold_miner",
        placeholder: answers.role === "gold_miner" ? "ex. Haut-Sassandra" : "Optionnel",
      },
      {
        id: "city",
        title: "Ville",
        kind: "text",
        field: "city",
        prompt: "Ville ?",
        placeholder: "ex. Abidjan",
        validate: (value) => (String(value || "").trim().length < 2 ? "Entrez une ville." : null),
      },
      {
        id: "address",
        title: "Adresse",
        kind: "textarea",
        field: "address",
        prompt: "Adresse complete ?",
        placeholder: "Rue, batiment et indications utiles",
        validate: (value) => (String(value || "").trim().length < 6 ? "Entrez une adresse complete." : null),
      },
      {
        id: "postalCode",
        title: "Code postal",
        kind: "text",
        field: "postalCode",
        prompt: "Code postal ? (optionnel)",
        required: false,
        placeholder: "Optionnel",
      },
    ];

    const review: ChatWizardStep<ApplicationAnswers> = {
      id: "review",
      title: "Verification",
      kind: "review",
      prompt: "Verifiez votre dossier, puis envoyez la demande.",
      renderSummary: (a, fileMeta) => {
        const roleLabel = getRoleLabel(a);
        const countryName = getCountryName(a.country);
        const docs = Object.entries(fileMeta)
          .filter(([, meta]) => !!meta?.name)
          .map(([key, meta]) => ({ key, name: meta?.name as string }));

        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">Resume</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-[12px] text-white/75">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">Contact</span>
                  <span className="text-right">{a.contact || "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">Nom complet</span>
                  <span className="text-right">{a.fullName || "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">Profil</span>
                  <span className="text-right">{roleLabel || "-"}</span>
                </div>
                {a.role === "gold_miner" && a.mineSubtype ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/60">Type d'operation</span>
                    <span className="text-right">{formatMineSubtype(a.mineSubtype) || a.mineSubtype}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">Localisation</span>
                  <span className="text-right">
                    {[countryName, a.stateRegion, a.city].filter(Boolean).join(", ") || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">Adresse</span>
                  <span className="text-right">{a.address || "-"}</span>
                </div>
                {a.postalCode ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/60">Code postal</span>
                    <span className="text-right">{a.postalCode}</span>
                  </div>
                ) : null}
                {a.licenseNumber ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/60">Numero d'autorisation</span>
                    <span className="text-right">{a.licenseNumber}</span>
                  </div>
                ) : null}
                {a.role === "investor" && (a.investmentRange || a.investorInterest) ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/60">Interet</span>
                    <span className="text-right">{[a.investmentRange, a.investorInterest].filter(Boolean).join(" · ")}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {docs.length ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-semibold text-white">Documents transmis</p>
                <div className="mt-2 space-y-1 text-[12px] text-white/70">
                  {docs.map((d) => (
                    <p key={d.key} className="truncate">
                      {d.name}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      },
    };

    if (answers.role === "gold_miner") {
      const mine: ChatWizardStep<ApplicationAnswers>[] = [
        {
          id: "mineSubtype",
          title: "Type d'operation",
          kind: "cards",
          field: "mineSubtype",
          prompt: "Quel type d'operation aurifere ?",
          options: [
            { value: "artisanal", title: "Artisanal" },
            { value: "semi_industrial", title: "Semi-industrial" },
            { value: "industrial", title: "Industrial" },
          ],
        },
        ...location,
        {
          id: "mineLicenseNow",
          title: "Autorisation",
          kind: "cards",
          field: "licenseUploadNow",
          prompt: "Avez-vous un document d'autorisation a transmettre maintenant ?",
          options: [
            { value: "yes", title: "Oui" },
            { value: "not_now", title: "Pas maintenant" },
          ],
        },
      ];

      if (answers.licenseUploadNow === "yes") {
        mine.push(
          {
            id: "mineLicenseDoc",
            title: "Document d'autorisation",
            kind: "file",
            fileKey: "mine_license_doc",
            prompt: "Televersez votre document d'autorisation.",
            accept: ".pdf,.jpg,.jpeg,.png",
          },
          {
            id: "licenseNumber",
            title: "Numero d'autorisation",
            kind: "text",
            field: "licenseNumber",
            prompt: "Numero d'autorisation",
            placeholder: "Entrez le numero du document",
          },
        );
      }

      return [...base, ...mine, review];
    }

    if (answers.role === "authorized_gold_buyer") {
      return [
        ...base,
        ...location,
        {
          id: "buyerLicenseDoc",
          title: "Document d'autorisation",
          kind: "file",
          fileKey: "buyer_license_doc",
          prompt: "Televersez votre document d'autorisation (obligatoire).",
          accept: ".pdf,.jpg,.jpeg,.png",
        },
        {
          id: "licenseNumber",
          title: "Numero d'autorisation",
          kind: "text",
          field: "licenseNumber",
          prompt: "Numero d'autorisation (obligatoire).",
          placeholder: "Entrez le numero du document",
        },
        review,
      ];
    }

    if (answers.role === "jewelry") {
      return [
        ...base,
        {
          id: "jewelrySubtype",
          title: "Type de bijoutier",
          kind: "cards",
          field: "jewelrySubtype",
          prompt: "Etes-vous fabricant ou revendeur ?",
          options: [
            { value: "manufacturer", title: "Fabricant" },
            { value: "reseller", title: "Revendeur" },
          ],
        },
        ...location,
        {
          id: "jewelryDocs",
          title: "Documents",
          kind: "file",
          fileKey: "jewelry_docs",
          prompt: "Televerser des documents d'autorisation ? (optionnel)",
          accept: ".pdf,.jpg,.jpeg,.png",
          required: false,
        },
        review,
      ];
    }

    if (answers.role === "machinery_manufacturer" || answers.role === "machinery_reseller") {
      const machinery: ChatWizardStep<ApplicationAnswers>[] = [
        ...location,
        {
          id: "sellOnPlatform",
          title: "Vente",
          kind: "cards",
          field: "sellOnPlatform",
          prompt: "Souhaitez-vous presenter une offre sur la plateforme ?",
          options: [
            { value: "yes", title: "Oui" },
            { value: "not_now", title: "Pas maintenant" },
          ],
        },
      ];

      if (answers.sellOnPlatform === "yes") {
        machinery.push({
          id: "machineryDocs",
          title: "Documents",
          kind: "file",
          fileKey: "machinery_docs",
          prompt: "Televerser des justificatifs ou autorisations ? (optionnel)",
          accept: ".pdf,.jpg,.jpeg,.png",
          required: false,
        });
      }

      return [...base, ...machinery, review];
    }

    if (answers.role === "investor") {
      return [
        ...base,
        ...location,
        {
          id: "investmentRange",
          title: "Budget",
          kind: "text",
          field: "investmentRange",
          prompt: "Quel est votre budget indicatif ? (optionnel)",
          placeholder: "ex. 10 000 USD - 50 000 USD",
          required: false,
        },
        {
          id: "investorInterest",
          title: "Interet",
          kind: "cards",
          field: "investorInterest",
          prompt: "Votre interet porte sur les mines, les equipements ou les deux ? (optionnel)",
          required: false,
          options: [
            { value: "mines", title: "Mines" },
            { value: "machinery", title: "Equipements" },
            { value: "both", title: "Les deux" },
          ],
        },
        review,
      ];
    }

    return [...base, ...location, review];
  };

  const submitApplication = async ({ answers, files }: { answers: ApplicationAnswers; files: Record<string, File | null> }) => {
    const roleKey = getRoleKey(answers);
    if (!roleKey) throw new Error("Profil manquant.");

    const { email, phone } = parseContact(answers.contact);
    const formData = new FormData();

    if (email) formData.append("email", email);
    if (phone) formData.append("phone", phone);
    formData.append("contact", answers.contact.trim());
    formData.append("displayName", answers.fullName.trim());
    formData.append("roleKey", roleKey);
    if (answers.mineSubtype) formData.append("mineSubtype", answers.mineSubtype);
    if (answers.jewelrySubtype) formData.append("jewelrySubtype", answers.jewelrySubtype);

    formData.append("country", answers.country);
    if (answers.stateRegion) formData.append("region", answers.stateRegion);
    formData.append("city", answers.city.trim());
    formData.append("address", answers.address.trim());
    if (answers.postalCode) formData.append("postalCode", answers.postalCode.trim());

    if (answers.licenseNumber) formData.append("licenseNumber", answers.licenseNumber.trim());
    if (answers.investmentRange) formData.append("investmentRange", answers.investmentRange.trim());
    if (answers.investorInterest) formData.append("investorInterest", answers.investorInterest);
    if (answers.sellOnPlatform) formData.append("sellOnPlatform", answers.sellOnPlatform);

    const docs: Array<{ file: File; type: string }> = [];
    if (files["buyer_license_doc"]) docs.push({ file: files["buyer_license_doc"], type: "trading_license" });
    if (files["mine_license_doc"]) docs.push({ file: files["mine_license_doc"], type: "government_authorization" });
    if (files["jewelry_docs"]) docs.push({ file: files["jewelry_docs"], type: "other" });
    if (files["machinery_docs"]) docs.push({ file: files["machinery_docs"], type: "other" });

    docs.forEach((d) => {
      formData.append("documents", d.file);
      formData.append("documentTypes", d.type);
      formData.append("documentNames", d.file.name);
    });

    const response = await fetch(resolveApiUrl("/api/ece/applications/submit"), { method: "POST", body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.message || "Impossible d'envoyer la demande.");
    }
    const data = await response.json();
    setApplicationRef(String(data.applicationRef || ""));
    setApplicationSubmitted(true);
  };

  const onLogin = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  if (applicationSubmitted) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-white flex flex-col">
        <header className="border-b border-[#D4AF37]/20 bg-[#0B0B0D]/90">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                <BrandLockup />
              </div>
            </Link>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg border-[#D4AF37]/25 bg-[#0D1B2A]/85 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[#D4AF37]/15 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-8 w-8 text-[#E8C873]" />
              </div>
              <h2 className="font-['Cinzel'] text-2xl font-semibold text-white mb-2">{copy.submittedTitle}</h2>
              <p className="text-[#F5F3EC]/70 mb-6">
                {copy.submittedBody}
              </p>
              
              <div className="rounded-lg border border-[#D4AF37]/20 bg-black/30 p-4 mb-6">
                <p className="text-sm text-[#F5F3EC]/55 mb-1">{copy.requestReference}</p>
                <p className="text-xl font-mono font-bold text-[#E8C873]">{applicationRef}</p>
              </div>

              <div className="space-y-4 text-left rounded-lg border border-white/10 bg-black/25 p-4 mb-6">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#E8C873]" />
                  {copy.nextSteps}
                </h3>
                <ol className="space-y-3 text-sm text-[#F5F3EC]/70">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[#E8C873] text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                    <span>{copy.step1}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[#E8C873] text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                    <span>{copy.step2}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[#E8C873] text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                    <span>{copy.step3}</span>
                  </li>
                </ol>
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="outline"
                  className="flex-1 border-[#D4AF37]/30 text-[#F5F3EC] hover:bg-[#D4AF37]/10"
                  onClick={() => setLocation("/")}
                >
                  {copy.back}
                </Button>
                <Button 
                  className="flex-1 bg-[#D4AF37] hover:bg-[#E8C873] text-[#0B0B0D] font-semibold"
                  onClick={() => setLocation(`/application-status?ref=${applicationRef}`)}
                >
                  {copy.trackApplication}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <InstitutionFooter />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-[#0B0B0D]"
      onTouchStart={(e) => {
        if (!isMobile) return;
        const touch = e.touches[0];
        if (!touch) return;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(e) => {
        if (!isMobile) return;
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start) return;
        const touch = e.changedTouches[0];
        if (!touch) return;

        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;

        const isEdgeSwipeBack = start.x < 24 && dx > 90 && Math.abs(dy) < 60;
        const isTopSwipeDown = start.y < 120 && dy > 140 && Math.abs(dx) < 80;
        if (isEdgeSwipeBack || isTopSwipeDown) {
          setLocation("/");
        }
      }}
    >
      {isBdoTenant ? (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{ backgroundImage: "url('/tenants/bdo/official/banners/bdo-banner-certification.jpg')" }}
        />
      ) : (
        <div className="absolute inset-0 opacity-40">
          <MapTeaser />
        </div>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(212,175,55,0.18),transparent_34%),linear-gradient(135deg,rgba(11,11,13,0.96),rgba(13,27,42,0.9)_48%,rgba(11,11,13,0.98))]" />

      <div className="relative min-h-screen flex flex-col">
        <header className="border-b border-[#D4AF37]/20 bg-[#0B0B0D]/75 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                <ArrowLeft className="h-5 w-5 text-[#E8C873]" />
                <BrandLockup />
              </div>
            </Link>

            <Button
              type="button"
              variant="ghost"
              className="h-10 w-10 p-0 text-[#F5F3EC]/75 hover:text-white hover:bg-[#D4AF37]/10"
              onClick={() => setLocation("/")}
              aria-label={copy.close}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+96px)] md:pb-4">
        <Card className="w-full max-w-3xl border-[#D4AF37]/25 bg-[#0B0B0D]/86 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.52)] my-4">
          <CardHeader className="text-center">
            <CardTitle className="font-['Cinzel'] text-2xl text-white">{copy.accessTitle}</CardTitle>
            <CardDescription className="text-[#F5F3EC]/68">
              {copy.accessDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "apply")}>
              <TabsList className="grid w-full grid-cols-2 border border-[#D4AF37]/15 bg-black/35">
                <TabsTrigger value="login" className="text-[#F5F3EC]/70 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B0B0D]">
                  {copy.signIn}
                </TabsTrigger>
                <TabsTrigger value="apply" className="text-[#F5F3EC]/70 data-[state=active]:bg-[#D4AF37] data-[state=active]:text-[#0B0B0D]">
                  {copy.requestAccess}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[#F5F3EC]/82">{copy.email}</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="text" 
                              inputMode="email"
                              autoComplete="email"
                              placeholder={copy.emailPlaceholder}
                              className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[#F5F3EC]/82">{copy.password}</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="password" 
                              autoComplete="current-password"
                              placeholder={copy.password}
                              className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full bg-[#D4AF37] hover:bg-[#E8C873] text-[#0B0B0D] font-semibold"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {copy.signingIn}
                        </>
                      ) : (
                        copy.signIn
                      )}
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="apply" className="mt-6">
                <ChatFormWizard<ApplicationAnswers>
                  title={copy.welcomeTitle(brand.name)}
                  description={copy.welcomeDescription}
                  storageKey="ece_registration_chat_v1"
                  initialAnswers={initialAnswers}
                  steps={applicationSteps}
                  submitLabel={copy.submitApplication}
                  onExit={() => setActiveTab("login")}
                  onSubmit={submitApplication}
                />
                {/*
                <div className="mb-4 p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-[#D4AF37] mt-0.5" />
                    <p className="text-xs text-[#E8C873]">
                      Applications require legal documents authorizing you to trade commodities. 
                      Our AI will review your application and you'll receive credentials once approved.
                    </p>
                  </div>
                </div>

                <Form {...applicationForm}>
                  <form onSubmit={applicationForm.handleSubmit(onSubmitApplication)} className="space-y-4">
                    <FormField
                      control={applicationForm.control}
                      name="displayName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-300">Full Name</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="John Doe"
                              className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={applicationForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-300">Email</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="text" 
                                inputMode="email"
                                placeholder="you@company.com"
                                className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={applicationForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-300">Phone</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="tel"
                                placeholder="+1 234 567 8900"
                                className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={applicationForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-300">I am applying as a</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35">
                                <SelectValue placeholder="Select your role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-gray-800 border-gray-700">
                              <SelectItem value="buyer" className="text-white">Buyer - Purchasing commodities</SelectItem>
                              <SelectItem value="supplier" className="text-white">Supplier - Selling commodities</SelectItem>
                              <SelectItem value="shareholder" className="text-white">Shareholder - Investor</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={applicationForm.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-300">Company Name</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Your company"
                                className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={applicationForm.control}
                        name="companyRegistration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-300">Registration #</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Optional"
                                className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={applicationForm.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-300">Country</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35">
                                <SelectValue placeholder="Select your country" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-gray-800 border-gray-700 max-h-[200px]">
                              <SelectItem value="US" className="text-white">United States</SelectItem>
                              <SelectItem value="GB" className="text-white">United Kingdom</SelectItem>
                              <SelectItem value="CH" className="text-white">Switzerland</SelectItem>
                              <SelectItem value="AE" className="text-white">United Arab Emirates</SelectItem>
                              <SelectItem value="SG" className="text-white">Singapore</SelectItem>
                              <SelectItem value="GH" className="text-white">Ghana</SelectItem>
                              <SelectItem value="ML" className="text-white">Mali</SelectItem>
                              <SelectItem value="BF" className="text-white">Burkina Faso</SelectItem>
                              <SelectItem value="CI" className="text-white">Ivory Coast</SelectItem>
                              <SelectItem value="TZ" className="text-white">Tanzania</SelectItem>
                              <SelectItem value="ZA" className="text-white">South Africa</SelectItem>
                              <SelectItem value="CD" className="text-white">DR Congo</SelectItem>
                              <SelectItem value="SD" className="text-white">Sudan</SelectItem>
                              <SelectItem value="IN" className="text-white">India</SelectItem>
                              <SelectItem value="CN" className="text-white">China</SelectItem>
                              <SelectItem value="HK" className="text-white">Hong Kong</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={applicationForm.control}
                      name="businessDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-300">Business Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="Describe your business and trading activities..."
                              className="bg-gray-800 border-gray-700 text-white min-h-[80px]"
                            />
                          </FormControl>
                          <FormDescription className="text-gray-500 text-xs">
                            Tell us about your company and what commodities you trade
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={applicationForm.control}
                        name="tradingExperience"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-300">Trading Experience</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="<1" className="text-white">Less than 1 year</SelectItem>
                                <SelectItem value="1-3" className="text-white">1-3 years</SelectItem>
                                <SelectItem value="3-5" className="text-white">3-5 years</SelectItem>
                                <SelectItem value="5-10" className="text-white">5-10 years</SelectItem>
                                <SelectItem value="10+" className="text-white">10+ years</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={applicationForm.control}
                        name="expectedVolume"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-gray-300">Expected Monthly Volume</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="border-[#D4AF37]/20 bg-black/35 text-white placeholder:text-white/35">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-gray-800 border-gray-700">
                                <SelectItem value="<10kg" className="text-white">Less than 10 kg</SelectItem>
                                <SelectItem value="10-50kg" className="text-white">10-50 kg</SelectItem>
                                <SelectItem value="50-100kg" className="text-white">50-100 kg</SelectItem>
                                <SelectItem value="100-500kg" className="text-white">100-500 kg</SelectItem>
                                <SelectItem value="500kg+" className="text-white">500 kg+</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="space-y-3">
                      <FormLabel className="text-gray-300">Supporting Documents *</FormLabel>
                      <FormDescription className="text-gray-500 text-xs">
                        Upload trading license, business registration, or government authorization
                      </FormDescription>
                      
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={handleFileSelect}
                      />

                      <div className="flex gap-2">
                        <Select value={currentDocType} onValueChange={(v) => setCurrentDocType(v as UploadedDocument['type'])}>
                          <SelectTrigger className="bg-gray-800 border-gray-700 text-white flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-800 border-gray-700">
                            <SelectItem value="trading_license" className="text-white">Trading License</SelectItem>
                            <SelectItem value="business_registration" className="text-white">Business Registration</SelectItem>
                            <SelectItem value="government_authorization" className="text-white">Government Authorization</SelectItem>
                            <SelectItem value="id_document" className="text-white">ID Document</SelectItem>
                            <SelectItem value="proof_of_funds" className="text-white">Proof of Funds</SelectItem>
                            <SelectItem value="other" className="text-white">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button 
                          type="button"
                          variant="outline"
                          className="border-gray-700 text-gray-300 hover:bg-gray-800"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                      </div>

                      {documents.length > 0 && (
                        <div className="space-y-2">
                          {documents.map((doc, index) => (
                            <div key={index} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2">
                              <FileText className="h-4 w-4 text-[#D4AF37]" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white truncate">{doc.name}</p>
                                <p className="text-xs text-gray-500">{getDocTypeLabel(doc.type)}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-gray-400 hover:text-red-400"
                                onClick={() => removeDocument(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full bg-[#D4AF37] hover:bg-[#E8C873] text-black font-semibold"
                      disabled={applicationMutation.isPending}
                    >
                      {applicationMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting Application...
                        </>
                      ) : (
                        "Submit Application"
                      )}
                    </Button>
                  </form>
                </Form>
                */}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 md:hidden" style={{ zIndex: 70 }}>
        <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] bg-black/80 backdrop-blur-xl border-t border-white/10">
          <Button
            type="button"
            className="w-full h-11 bg-white/10 hover:bg-white/15 text-white font-semibold"
            onClick={() => setLocation("/")}
          >
            Continue browsing
          </Button>
        </div>
      </div>
      <InstitutionFooter className="mt-auto" />
      </div>
    </div>
  );
}
