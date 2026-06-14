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

function getApplicationWizardCopy(language: string) {
  if (language === "ar") {
    return {
      ui: {
        step: (current: number, total: number) => `الخطوة ${current} من ${total}`,
        steps: "الخطوات",
        progress: "التقدم",
        saveAndContinueLater: "حفظ والمتابعة لاحقاً",
        application: "طلب الوصول",
        close: "إغلاق",
        done: "تم",
      },
      contactTitle: "الاتصال",
      contactPrompt: "ما بريدك الإلكتروني أو رقم هاتفك؟",
      contactPlaceholder: "name@example.com أو +225 01 23 45 67 89",
      contactRequired: "أدخل البريد الإلكتروني أو رقم الهاتف.",
      contactInvalidEmail: "أدخل بريداً إلكترونياً صحيحاً.",
      contactInvalidPhone: "أدخل رقم هاتف صحيحاً.",
      fullNameTitle: "الاسم الكامل",
      fullNamePrompt: "ما اسمك الكامل؟",
      fullNamePlaceholder: "اسمك الكامل",
      fullNameRequired: "أدخل اسمك الكامل.",
      profileTitle: "الملف",
      profilePrompt: "أي ملف تريد الانضمام به؟",
      roles: {
        goldMiner: ["مستغل ذهب", "نشاط حرفي أو شبه صناعي أو صناعي."],
        authorizedBuyer: ["مشتري جملة معتمد", "مكتب شراء أو مشتري لديه وثائق تفويض."],
        jewelry: ["صائغ", "مصنع أو بائع مجوهرات موثقة."],
        machineryManufacturer: ["مصنع معدات", "مورد معدات للعمليات المرتبطة بالذهب."],
        machineryReseller: ["موزع معدات", "توزيع أو تمثيل معدات التعدين."],
        investor: ["مشتري أو مؤسسة", "اهتمام بالشراء أو التوثيق أو الشراكات."],
      },
      countryTitle: "البلد",
      countryPromptDefault: "البلد؟",
      countryPromptMine: "في أي بلد يقع نشاطك؟",
      countryPromptBuyer: "في أي بلد لديك الترخيص؟",
      regionTitle: "المنطقة",
      regionPromptMine: "ما المنطقة أو المحلية؟",
      regionPromptOptional: "المنطقة؟ (اختياري)",
      regionPlaceholderMine: "مثال: Haut-Sassandra",
      optional: "اختياري",
      cityTitle: "المدينة",
      cityPrompt: "المدينة؟",
      cityPlaceholder: "مثال: أبيدجان",
      cityRequired: "أدخل المدينة.",
      addressTitle: "العنوان",
      addressPrompt: "العنوان الكامل؟",
      addressPlaceholder: "الشارع والمبنى والإرشادات المفيدة",
      addressRequired: "أدخل عنواناً كاملاً.",
      postalTitle: "الرمز البريدي",
      postalPrompt: "الرمز البريدي؟ (اختياري)",
      reviewTitle: "التحقق",
      reviewPrompt: "راجع ملفك ثم أرسل الطلب.",
      summaryTitle: "الملخص",
      summaryLabels: {
        contact: "الاتصال",
        fullName: "الاسم الكامل",
        profile: "الملف",
        operationType: "نوع العملية",
        location: "الموقع",
        address: "العنوان",
        postalCode: "الرمز البريدي",
        licenseNumber: "رقم التفويض",
        interest: "الاهتمام",
        documents: "الوثائق المرسلة",
      },
      mineSubtypeTitle: "نوع العملية",
      mineSubtypePrompt: "ما نوع العملية المرتبطة بالذهب؟",
      mineSubtypes: {
        artisanal: "حرفي",
        semiIndustrial: "شبه صناعي",
        industrial: "صناعي",
      },
      authorizationTitle: "التفويض",
      authorizationPrompt: "هل لديك وثيقة تفويض لإرسالها الآن؟",
      yes: "نعم",
      notNow: "ليس الآن",
      authorizationDocumentTitle: "وثيقة التفويض",
      authorizationDocumentPrompt: "ارفع وثيقة التفويض.",
      authorizationDocumentRequiredPrompt: "ارفع وثيقة التفويض (إلزامي).",
      authorizationNumberTitle: "رقم التفويض",
      authorizationNumberPrompt: "رقم التفويض",
      authorizationNumberRequiredPrompt: "رقم التفويض (إلزامي).",
      authorizationNumberPlaceholder: "أدخل رقم الوثيقة",
      jewelerTypeTitle: "نوع الصائغ",
      jewelerTypePrompt: "هل أنت مصنع أم بائع؟",
      manufacturer: "مصنع",
      reseller: "بائع",
      documentsTitle: "الوثائق",
      jewelryDocsPrompt: "هل تريد رفع وثائق تفويض؟ (اختياري)",
      saleTitle: "العرض",
      salePrompt: "هل تريد تقديم عرض على المنصة؟",
      machineryDocsPrompt: "ارفع إثباتات أو تفويضات؟ (اختياري)",
      budgetTitle: "الميزانية",
      budgetPrompt: "ما الميزانية التقديرية؟ (اختياري)",
      budgetPlaceholder: "مثال: 10 000 USD - 50 000 USD",
      interestTitle: "الاهتمام",
      interestPrompt: "هل اهتمامك بالمناجم أو المعدات أو الاثنين؟ (اختياري)",
      mines: "المناجم",
      machinery: "المعدات",
      both: "الاثنان",
      missingProfile: "الملف مفقود.",
      continueBrowsing: "متابعة التصفح",
    };
  }

  if (language === "en") {
    return {
      ui: {
        step: (current: number, total: number) => `Step ${current} of ${total}`,
        steps: "Steps",
        progress: "Progress",
        saveAndContinueLater: "Save and continue later",
        application: "Access request",
        close: "Close",
        done: "Done",
      },
      contactTitle: "Contact",
      contactPrompt: "What is your email or phone number?",
      contactPlaceholder: "name@example.com or +225 01 23 45 67 89",
      contactRequired: "Enter your email or phone number.",
      contactInvalidEmail: "Enter a valid email address.",
      contactInvalidPhone: "Enter a valid phone number.",
      fullNameTitle: "Full name",
      fullNamePrompt: "What is your full name?",
      fullNamePlaceholder: "Your full name",
      fullNameRequired: "Enter your full name.",
      profileTitle: "Profile",
      profilePrompt: "Which profile do you want to join with?",
      roles: {
        goldMiner: ["Gold operator", "Artisanal, semi-industrial or industrial operation."],
        authorizedBuyer: ["Authorized wholesale buyer", "Purchasing office or buyer with authorization documents."],
        jewelry: ["Jeweler", "Manufacturer or reseller of verified jewelry."],
        machineryManufacturer: ["Equipment manufacturer", "Supplier of equipment for gold-related operations."],
        machineryReseller: ["Equipment distributor", "Distribution or representation of mining equipment."],
        investor: ["Buyer or institution", "Interest in purchasing, certification or partnerships."],
      },
      countryTitle: "Country",
      countryPromptDefault: "Country?",
      countryPromptMine: "In which country is your operation located?",
      countryPromptBuyer: "In which country are you authorized?",
      regionTitle: "Region",
      regionPromptMine: "Which region or locality?",
      regionPromptOptional: "Region? (optional)",
      regionPlaceholderMine: "e.g. Haut-Sassandra",
      optional: "Optional",
      cityTitle: "City",
      cityPrompt: "City?",
      cityPlaceholder: "e.g. Abidjan",
      cityRequired: "Enter a city.",
      addressTitle: "Address",
      addressPrompt: "Complete address?",
      addressPlaceholder: "Street, building and useful directions",
      addressRequired: "Enter a complete address.",
      postalTitle: "Postal code",
      postalPrompt: "Postal code? (optional)",
      reviewTitle: "Verification",
      reviewPrompt: "Review your file, then submit the request.",
      summaryTitle: "Summary",
      summaryLabels: {
        contact: "Contact",
        fullName: "Full name",
        profile: "Profile",
        operationType: "Operation type",
        location: "Location",
        address: "Address",
        postalCode: "Postal code",
        licenseNumber: "Authorization number",
        interest: "Interest",
        documents: "Submitted documents",
      },
      mineSubtypeTitle: "Operation type",
      mineSubtypePrompt: "What type of gold operation?",
      mineSubtypes: {
        artisanal: "Artisanal",
        semiIndustrial: "Semi-industrial",
        industrial: "Industrial",
      },
      authorizationTitle: "Authorization",
      authorizationPrompt: "Do you have an authorization document to submit now?",
      yes: "Yes",
      notNow: "Not now",
      authorizationDocumentTitle: "Authorization document",
      authorizationDocumentPrompt: "Upload your authorization document.",
      authorizationDocumentRequiredPrompt: "Upload your authorization document (required).",
      authorizationNumberTitle: "Authorization number",
      authorizationNumberPrompt: "Authorization number",
      authorizationNumberRequiredPrompt: "Authorization number (required).",
      authorizationNumberPlaceholder: "Enter the document number",
      jewelerTypeTitle: "Jeweler type",
      jewelerTypePrompt: "Are you a manufacturer or reseller?",
      manufacturer: "Manufacturer",
      reseller: "Reseller",
      documentsTitle: "Documents",
      jewelryDocsPrompt: "Upload authorization documents? (optional)",
      saleTitle: "Offer",
      salePrompt: "Do you want to present an offer on the platform?",
      machineryDocsPrompt: "Upload supporting documents or authorizations? (optional)",
      budgetTitle: "Budget",
      budgetPrompt: "What is your indicative budget? (optional)",
      budgetPlaceholder: "e.g. 10,000 USD - 50,000 USD",
      interestTitle: "Interest",
      interestPrompt: "Is your interest in mines, equipment or both? (optional)",
      mines: "Mines",
      machinery: "Equipment",
      both: "Both",
      missingProfile: "Missing profile.",
      continueBrowsing: "Continue browsing",
    };
  }

  return {
    ui: {
      step: (current: number, total: number) => `Etape ${current} sur ${total}`,
      steps: "Etapes",
      progress: "Progression",
      saveAndContinueLater: "Enregistrer et continuer plus tard",
      application: "Demande d'acces",
      close: "Fermer",
      done: "Termine",
    },
    contactTitle: "Contact",
    contactPrompt: "Quel est votre email ou numero de telephone ?",
    contactPlaceholder: "nom@example.com ou +225 01 23 45 67 89",
    contactRequired: "Entrez votre email ou numero de telephone.",
    contactInvalidEmail: "Entrez une adresse email valide.",
    contactInvalidPhone: "Entrez un numero de telephone valide.",
    fullNameTitle: "Nom complet",
    fullNamePrompt: "Quel est votre nom complet ?",
    fullNamePlaceholder: "Votre nom complet",
    fullNameRequired: "Entrez votre nom complet.",
    profileTitle: "Profil",
    profilePrompt: "Quel profil souhaitez-vous rejoindre ?",
    roles: {
      goldMiner: ["Exploitant aurifere", "Operation artisanale, semi-industrielle ou industrielle."],
      authorizedBuyer: ["Acheteur grossiste autorise", "Bureau d'achat ou acheteur avec documents d'autorisation."],
      jewelry: ["Bijoutier", "Fabricant ou revendeur de bijoux verifies."],
      machineryManufacturer: ["Fabricant d'equipements", "Fournisseur d'equipements pour operations auriferes."],
      machineryReseller: ["Distributeur d'equipements", "Distribution ou representation d'equipements miniers."],
      investor: ["Acheteur ou institution", "Interet pour l'achat, la certification ou les partenariats."],
    },
    countryTitle: "Pays",
    countryPromptDefault: "Pays ?",
    countryPromptMine: "Dans quel pays se situe votre operation ?",
    countryPromptBuyer: "Dans quel pays etes-vous autorise ?",
    regionTitle: "Region",
    regionPromptMine: "Quelle region ou localite ?",
    regionPromptOptional: "Region ? (optionnel)",
    regionPlaceholderMine: "ex. Haut-Sassandra",
    optional: "Optionnel",
    cityTitle: "Ville",
    cityPrompt: "Ville ?",
    cityPlaceholder: "ex. Abidjan",
    cityRequired: "Entrez une ville.",
    addressTitle: "Adresse",
    addressPrompt: "Adresse complete ?",
    addressPlaceholder: "Rue, batiment et indications utiles",
    addressRequired: "Entrez une adresse complete.",
    postalTitle: "Code postal",
    postalPrompt: "Code postal ? (optionnel)",
    reviewTitle: "Verification",
    reviewPrompt: "Verifiez votre dossier, puis envoyez la demande.",
    summaryTitle: "Resume",
    summaryLabels: {
      contact: "Contact",
      fullName: "Nom complet",
      profile: "Profil",
      operationType: "Type d'operation",
      location: "Localisation",
      address: "Adresse",
      postalCode: "Code postal",
      licenseNumber: "Numero d'autorisation",
      interest: "Interet",
      documents: "Documents transmis",
    },
    mineSubtypeTitle: "Type d'operation",
    mineSubtypePrompt: "Quel type d'operation aurifere ?",
    mineSubtypes: {
      artisanal: "Artisanal",
      semiIndustrial: "Semi-industrial",
      industrial: "Industrial",
    },
    authorizationTitle: "Autorisation",
    authorizationPrompt: "Avez-vous un document d'autorisation a transmettre maintenant ?",
    yes: "Oui",
    notNow: "Pas maintenant",
    authorizationDocumentTitle: "Document d'autorisation",
    authorizationDocumentPrompt: "Televersez votre document d'autorisation.",
    authorizationDocumentRequiredPrompt: "Televersez votre document d'autorisation (obligatoire).",
    authorizationNumberTitle: "Numero d'autorisation",
    authorizationNumberPrompt: "Numero d'autorisation",
    authorizationNumberRequiredPrompt: "Numero d'autorisation (obligatoire).",
    authorizationNumberPlaceholder: "Entrez le numero du document",
    jewelerTypeTitle: "Type de bijoutier",
    jewelerTypePrompt: "Etes-vous fabricant ou revendeur ?",
    manufacturer: "Fabricant",
    reseller: "Revendeur",
    documentsTitle: "Documents",
    jewelryDocsPrompt: "Televerser des documents d'autorisation ? (optionnel)",
    saleTitle: "Vente",
    salePrompt: "Souhaitez-vous presenter une offre sur la plateforme ?",
    machineryDocsPrompt: "Televerser des justificatifs ou autorisations ? (optionnel)",
    budgetTitle: "Budget",
    budgetPrompt: "Quel est votre budget indicatif ? (optionnel)",
    budgetPlaceholder: "ex. 10 000 USD - 50 000 USD",
    interestTitle: "Interet",
    interestPrompt: "Votre interet porte sur les mines, les equipements ou les deux ? (optionnel)",
    mines: "Mines",
    machinery: "Equipements",
    both: "Les deux",
    missingProfile: "Profil manquant.",
    continueBrowsing: "Continuer la navigation",
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
  const wizardCopy = useMemo(() => getApplicationWizardCopy(language), [language]);
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
        title: wizardCopy.contactTitle,
        kind: "text",
        field: "contact",
        prompt: wizardCopy.contactPrompt,
        placeholder: wizardCopy.contactPlaceholder,
        validate: (value) => {
          const raw = String(value || "").trim();
          if (!raw) return wizardCopy.contactRequired;
          if (raw.includes("@")) {
            const res = z.string().email().safeParse(raw);
            return res.success ? null : wizardCopy.contactInvalidEmail;
          }
          const digits = raw.replace(/[^\d]/g, "");
          if (digits.length < 7) return wizardCopy.contactInvalidPhone;
          return null;
        },
      },
      {
        id: "fullName",
        title: wizardCopy.fullNameTitle,
        kind: "text",
        field: "fullName",
        prompt: wizardCopy.fullNamePrompt,
        placeholder: wizardCopy.fullNamePlaceholder,
        validate: (value) => (String(value || "").trim().length < 2 ? wizardCopy.fullNameRequired : null),
      },
      {
        id: "role",
        title: wizardCopy.profileTitle,
        kind: "cards",
        field: "role",
        prompt: wizardCopy.profilePrompt,
        options: [
          {
            value: "gold_miner",
            title: wizardCopy.roles.goldMiner[0],
            description: wizardCopy.roles.goldMiner[1],
          },
          {
            value: "authorized_gold_buyer",
            title: wizardCopy.roles.authorizedBuyer[0],
            description: wizardCopy.roles.authorizedBuyer[1],
          },
          {
            value: "jewelry",
            title: wizardCopy.roles.jewelry[0],
            description: wizardCopy.roles.jewelry[1],
          },
          {
            value: "machinery_manufacturer",
            title: wizardCopy.roles.machineryManufacturer[0],
            description: wizardCopy.roles.machineryManufacturer[1],
          },
          {
            value: "machinery_reseller",
            title: wizardCopy.roles.machineryReseller[0],
            description: wizardCopy.roles.machineryReseller[1],
          },
          {
            value: "investor",
            title: wizardCopy.roles.investor[0],
            description: wizardCopy.roles.investor[1],
          },
        ],
      },
    ];

    if (!answers.role) return base;

    const countryPrompt = (() => {
      switch (answers.role) {
        case "gold_miner":
          return wizardCopy.countryPromptMine;
        case "authorized_gold_buyer":
          return wizardCopy.countryPromptBuyer;
        default:
          return wizardCopy.countryPromptDefault;
      }
    })();

    const location: ChatWizardStep<ApplicationAnswers>[] = [
      {
        id: "country",
        title: wizardCopy.countryTitle,
        kind: "custom",
        prompt: countryPrompt,
        isComplete: (a) => !!a.country,
        render: ({ answers, setAnswer }) => (
          <CountryCombobox value={answers.country} onChange={(code) => setAnswer("country", code)} />
        ),
      },
      {
        id: "stateRegion",
        title: wizardCopy.regionTitle,
        kind: "text",
        field: "stateRegion",
        prompt: answers.role === "gold_miner" ? wizardCopy.regionPromptMine : wizardCopy.regionPromptOptional,
        required: (a) => a.role === "gold_miner",
        placeholder: answers.role === "gold_miner" ? wizardCopy.regionPlaceholderMine : wizardCopy.optional,
      },
      {
        id: "city",
        title: wizardCopy.cityTitle,
        kind: "text",
        field: "city",
        prompt: wizardCopy.cityPrompt,
        placeholder: wizardCopy.cityPlaceholder,
        validate: (value) => (String(value || "").trim().length < 2 ? wizardCopy.cityRequired : null),
      },
      {
        id: "address",
        title: wizardCopy.addressTitle,
        kind: "textarea",
        field: "address",
        prompt: wizardCopy.addressPrompt,
        placeholder: wizardCopy.addressPlaceholder,
        validate: (value) => (String(value || "").trim().length < 6 ? wizardCopy.addressRequired : null),
      },
      {
        id: "postalCode",
        title: wizardCopy.postalTitle,
        kind: "text",
        field: "postalCode",
        prompt: wizardCopy.postalPrompt,
        required: false,
        placeholder: wizardCopy.optional,
      },
    ];

    const review: ChatWizardStep<ApplicationAnswers> = {
      id: "review",
      title: wizardCopy.reviewTitle,
      kind: "review",
      prompt: wizardCopy.reviewPrompt,
      renderSummary: (a, fileMeta) => {
        const roleLabel = (() => {
          if (a.role === "gold_miner") return wizardCopy.roles.goldMiner[0];
          if (a.role === "authorized_gold_buyer") return wizardCopy.roles.authorizedBuyer[0];
          if (a.role === "jewelry") return wizardCopy.roles.jewelry[0];
          if (a.role === "machinery_manufacturer") return wizardCopy.roles.machineryManufacturer[0];
          if (a.role === "machinery_reseller") return wizardCopy.roles.machineryReseller[0];
          if (a.role === "investor") return wizardCopy.roles.investor[0];
          return getRoleLabel(a);
        })();
        const mineSubtypeLabel = (() => {
          if (a.mineSubtype === "artisanal") return wizardCopy.mineSubtypes.artisanal;
          if (a.mineSubtype === "semi_industrial") return wizardCopy.mineSubtypes.semiIndustrial;
          if (a.mineSubtype === "industrial") return wizardCopy.mineSubtypes.industrial;
          return formatMineSubtype(a.mineSubtype) || a.mineSubtype;
        })();
        const countryName = getCountryName(a.country);
        const docs = Object.entries(fileMeta)
          .filter(([, meta]) => !!meta?.name)
          .map(([key, meta]) => ({ key, name: meta?.name as string }));

        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm font-semibold text-white">{wizardCopy.summaryTitle}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-[12px] text-white/75">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">{wizardCopy.summaryLabels.contact}</span>
                  <span className="text-right">{a.contact || "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">{wizardCopy.summaryLabels.fullName}</span>
                  <span className="text-right">{a.fullName || "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">{wizardCopy.summaryLabels.profile}</span>
                  <span className="text-right">{roleLabel || "-"}</span>
                </div>
                {a.role === "gold_miner" && a.mineSubtype ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/60">{wizardCopy.summaryLabels.operationType}</span>
                    <span className="text-right">{mineSubtypeLabel}</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">{wizardCopy.summaryLabels.location}</span>
                  <span className="text-right">
                    {[countryName, a.stateRegion, a.city].filter(Boolean).join(", ") || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/60">{wizardCopy.summaryLabels.address}</span>
                  <span className="text-right">{a.address || "-"}</span>
                </div>
                {a.postalCode ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/60">{wizardCopy.summaryLabels.postalCode}</span>
                    <span className="text-right">{a.postalCode}</span>
                  </div>
                ) : null}
                {a.licenseNumber ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/60">{wizardCopy.summaryLabels.licenseNumber}</span>
                    <span className="text-right">{a.licenseNumber}</span>
                  </div>
                ) : null}
                {a.role === "investor" && (a.investmentRange || a.investorInterest) ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/60">{wizardCopy.summaryLabels.interest}</span>
                    <span className="text-right">{[a.investmentRange, a.investorInterest].filter(Boolean).join(" · ")}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {docs.length ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-semibold text-white">{wizardCopy.summaryLabels.documents}</p>
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
          title: wizardCopy.mineSubtypeTitle,
          kind: "cards",
          field: "mineSubtype",
          prompt: wizardCopy.mineSubtypePrompt,
          options: [
            { value: "artisanal", title: wizardCopy.mineSubtypes.artisanal },
            { value: "semi_industrial", title: wizardCopy.mineSubtypes.semiIndustrial },
            { value: "industrial", title: wizardCopy.mineSubtypes.industrial },
          ],
        },
        ...location,
        {
          id: "mineLicenseNow",
          title: wizardCopy.authorizationTitle,
          kind: "cards",
          field: "licenseUploadNow",
          prompt: wizardCopy.authorizationPrompt,
          options: [
            { value: "yes", title: wizardCopy.yes },
            { value: "not_now", title: wizardCopy.notNow },
          ],
        },
      ];

      if (answers.licenseUploadNow === "yes") {
        mine.push(
          {
            id: "mineLicenseDoc",
            title: wizardCopy.authorizationDocumentTitle,
            kind: "file",
            fileKey: "mine_license_doc",
            prompt: wizardCopy.authorizationDocumentPrompt,
            accept: ".pdf,.jpg,.jpeg,.png",
          },
          {
            id: "licenseNumber",
            title: wizardCopy.authorizationNumberTitle,
            kind: "text",
            field: "licenseNumber",
            prompt: wizardCopy.authorizationNumberPrompt,
            placeholder: wizardCopy.authorizationNumberPlaceholder,
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
          title: wizardCopy.authorizationDocumentTitle,
          kind: "file",
          fileKey: "buyer_license_doc",
          prompt: wizardCopy.authorizationDocumentRequiredPrompt,
          accept: ".pdf,.jpg,.jpeg,.png",
        },
        {
          id: "licenseNumber",
          title: wizardCopy.authorizationNumberTitle,
          kind: "text",
          field: "licenseNumber",
          prompt: wizardCopy.authorizationNumberRequiredPrompt,
          placeholder: wizardCopy.authorizationNumberPlaceholder,
        },
        review,
      ];
    }

    if (answers.role === "jewelry") {
      return [
        ...base,
        {
          id: "jewelrySubtype",
          title: wizardCopy.jewelerTypeTitle,
          kind: "cards",
          field: "jewelrySubtype",
          prompt: wizardCopy.jewelerTypePrompt,
          options: [
            { value: "manufacturer", title: wizardCopy.manufacturer },
            { value: "reseller", title: wizardCopy.reseller },
          ],
        },
        ...location,
        {
          id: "jewelryDocs",
          title: wizardCopy.documentsTitle,
          kind: "file",
          fileKey: "jewelry_docs",
          prompt: wizardCopy.jewelryDocsPrompt,
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
          title: wizardCopy.saleTitle,
          kind: "cards",
          field: "sellOnPlatform",
          prompt: wizardCopy.salePrompt,
          options: [
            { value: "yes", title: wizardCopy.yes },
            { value: "not_now", title: wizardCopy.notNow },
          ],
        },
      ];

      if (answers.sellOnPlatform === "yes") {
        machinery.push({
          id: "machineryDocs",
          title: wizardCopy.documentsTitle,
          kind: "file",
          fileKey: "machinery_docs",
          prompt: wizardCopy.machineryDocsPrompt,
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
          title: wizardCopy.budgetTitle,
          kind: "text",
          field: "investmentRange",
          prompt: wizardCopy.budgetPrompt,
          placeholder: wizardCopy.budgetPlaceholder,
          required: false,
        },
        {
          id: "investorInterest",
          title: wizardCopy.interestTitle,
          kind: "cards",
          field: "investorInterest",
          prompt: wizardCopy.interestPrompt,
          required: false,
          options: [
            { value: "mines", title: wizardCopy.mines },
            { value: "machinery", title: wizardCopy.machinery },
            { value: "both", title: wizardCopy.both },
          ],
        },
        review,
      ];
    }

    return [...base, ...location, review];
  };

  const submitApplication = async ({ answers, files }: { answers: ApplicationAnswers; files: Record<string, File | null> }) => {
    const roleKey = getRoleKey(answers);
    if (!roleKey) throw new Error(wizardCopy.missingProfile);

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
                  uiLabels={wizardCopy.ui}
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
            {wizardCopy.continueBrowsing}
          </Button>
        </div>
      </div>
      <InstitutionFooter className="mt-auto" />
      </div>
    </div>
  );
}
