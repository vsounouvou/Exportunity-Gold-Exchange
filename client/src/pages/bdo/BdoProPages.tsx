import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import { apiRequest } from "@/lib/queryClient";
import { useLocale } from "@/contexts/LocaleContext";

type ProProfile = {
  id: string;
  role: string;
  membershipTier: string;
  verificationStatus: string;
  companyName: string | null;
  country: string | null;
  canAccessMap: boolean;
  canViewSupplyContacts: boolean;
  canViewMineLayer: boolean;
  canViewBureauLayer: boolean;
  canViewExportLayer: boolean;
};

type ProSummaryResponse = {
  ok: boolean;
  profile: ProProfile;
  map: {
    variant: "buyer" | "source";
    title: string;
    subtitle: string;
    defaultTypes: string[];
    locked: boolean;
    lockedMessage: string | null;
  };
  stats: {
    verifiedBureaux: number;
    verifiedExporters: number;
    activeRegions: number;
    sourcingNodes: number;
    totalVisibleNodes: number;
  };
};

type ProMapNode = {
  id: string;
  nodeType: string;
  layers: string[];
  name: string;
  slug: string | null;
  description: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  verificationStatus: string;
  companyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  wholesaleReady: boolean;
  metadata: Record<string, unknown>;
};

type ProMapResponse = {
  ok: boolean;
  map: ProSummaryResponse["map"];
  stats: ProSummaryResponse["stats"];
  items: ProMapNode[];
};

type DirectoryItem = {
  id: string;
  companyName: string;
  verified: boolean;
  region: string | null;
  country: string | null;
  city: string | null;
  type: string;
  wholesaleReady: boolean;
  services?: string[];
  activeOffers?: number;
  totalWeightKg?: number;
  contactPhone?: string | null;
  contactEmail?: string | null;
  mapLink: string;
};

type DirectoryResponse = {
  ok: boolean;
  items: DirectoryItem[];
};

type LeafletDeps = {
  MapContainer: any;
  TileLayer: any;
  Marker: any;
  Popup: any;
  divIcon: any;
};

const tierLabels: Record<string, string> = {
  free: "Public",
  pro_basic: "Pro Basic",
  pro_buyer: "Pro Buyer",
  pro_source: "Pro Source",
  admin_internal: "Admin interne",
};

const tierRank: Record<string, number> = {
  free: 0,
  pro_basic: 1,
  pro_buyer: 2,
  pro_source: 3,
  admin_internal: 4,
};

function statusTone(verified: boolean) {
  return verified
    ? "border-[#D4AF37]/35 bg-[#D4AF37]/12 text-[#F1D27A]"
    : "border-[#7A5A18]/45 bg-[#7A5A18]/18 text-[#F5F3EC]/75";
}

function mapNodeTone(nodeType: string) {
  if (nodeType === "bureau_achat") return "#D4AF37";
  if (nodeType === "exporter" || nodeType === "export_hub") return "#E8C873";
  if (nodeType === "mine" || nodeType === "artisanal_zone") return "#7A5A18";
  if (nodeType === "association" || nodeType === "regional_supply_node") return "#F5F3EC";
  return "#D4AF37";
}

function mapNodeShortCode(nodeType: string) {
  if (nodeType === "bureau_achat") return "BA";
  if (nodeType === "exporter" || nodeType === "export_hub") return "EX";
  if (nodeType === "mine") return "Au";
  if (nodeType === "artisanal_zone") return "ZA";
  if (nodeType === "association") return "AS";
  if (nodeType === "regional_supply_node") return "SR";
  if (nodeType === "logistics_hub") return "LG";
  if (nodeType === "equipment_node") return "EQ";
  return "OR";
}

function createMapNodeIcon(divIcon: LeafletDeps["divIcon"], node: ProMapNode, large = false) {
  const color = mapNodeTone(node.nodeType);
  const size = large ? 38 : 32;
  const innerSize = large ? 28 : 24;
  const label = mapNodeShortCode(node.nodeType);
  const html =
    '<span style="width:' + size + 'px;height:' + size + 'px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(145deg,#050505,#0D1B2A);border:1px solid ' + color + ';box-shadow:0 10px 24px rgba(0,0,0,.42);">' +
    '<span style="width:' + innerSize + 'px;height:' + innerSize + 'px;display:grid;place-items:center;border-radius:9px;background:linear-gradient(145deg,' + color + ',#F5F3EC);color:#0B0B0D;font-size:10px;font-weight:900;letter-spacing:0;font-family:Montserrat,Arial,sans-serif;">' + label + '</span>' +
    '</span>';
  return divIcon({
    className: "bdl-map-marker",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

const PUBLIC_WHOLESALE_NODES: ProMapNode[] = [
  {
    id: "public-mine-ity",
    nodeType: "mine",
    layers: ["mine"],
    name: "Signal minier Ouest - Ity",
    slug: "signal-minier-ity",
    description: "Zone de production aurifere a examiner avec documents, disponibilite et revue de conformite avant toute operation.",
    country: "CI",
    region: "Montagnes",
    city: "Zouan-Hounien",
    latitude: 6.841,
    longitude: -8.118,
    verificationStatus: "verified",
    companyName: "Zone de sourcing documentee",
    contactName: null,
    contactPhone: null,
    contactWhatsapp: null,
    contactEmail: null,
    wholesaleReady: true,
    metadata: { publicPreview: true, layer: "mine" },
  },
  {
    id: "public-artisanal-bouafle",
    nodeType: "artisanal_zone",
    layers: ["artisanal_zone"],
    name: "Zone artisanale encadree - Marahoue",
    slug: "zone-artisanale-marahoue",
    description: "Signal de sourcing necessitant verification d'origine, controle qualite et validation documentaire.",
    country: "CI",
    region: "Marahoue",
    city: "Bouafle",
    latitude: 6.982,
    longitude: -5.744,
    verificationStatus: "pending",
    companyName: "Sourcing responsable",
    contactName: null,
    contactPhone: null,
    contactWhatsapp: null,
    contactEmail: null,
    wholesaleReady: true,
    metadata: { publicPreview: true, layer: "artisanal_zone" },
  },
  {
    id: "public-supply-bouake",
    nodeType: "regional_supply_node",
    layers: ["regional_supply_node", "bureau_achat"],
    name: "Noeud d'approvisionnement de Bouake",
    slug: "noeud-approvisionnement-bouake-public",
    description: "Consolidation des flux de sourcing, preparation documentaire et coordination pour demandes en gros.",
    country: "CI",
    region: "Gbeke",
    city: "Bouake",
    latitude: 7.689,
    longitude: -5.03,
    verificationStatus: "verified",
    companyName: "Desk sourcing BOURSE DE L'OR",
    contactName: null,
    contactPhone: null,
    contactWhatsapp: null,
    contactEmail: null,
    wholesaleReady: true,
    metadata: { publicPreview: true, layer: "regional_supply_node" },
  },
  {
    id: "public-association-korhogo",
    nodeType: "association",
    layers: ["association", "regional_supply_node"],
    name: "Association acheteurs auriferes du Nord",
    slug: "association-acheteurs-nord-public",
    description: "Reseau regional pour qualification de contreparties, origine declaree et demandes structurees.",
    country: "CI",
    region: "Poro",
    city: "Korhogo",
    latitude: 9.458,
    longitude: -5.629,
    verificationStatus: "verified",
    companyName: "Reseau professionnel Nord",
    contactName: null,
    contactPhone: null,
    contactWhatsapp: null,
    contactEmail: null,
    wholesaleReady: true,
    metadata: { publicPreview: true, layer: "association" },
  },
  {
    id: "public-export-abidjan",
    nodeType: "export_hub",
    layers: ["export_hub", "exporter"],
    name: "Hub export et conformite - Abidjan",
    slug: "hub-export-abidjan-public",
    description: "Coordination paiement, documentation, verification, livraison ou stockage selon disponibilite et conformite.",
    country: "CI",
    region: "Abidjan",
    city: "Abidjan",
    latitude: 5.3364,
    longitude: -4.0267,
    verificationStatus: "verified",
    companyName: "Cellule export BOURSE DE L'OR",
    contactName: null,
    contactPhone: null,
    contactWhatsapp: null,
    contactEmail: null,
    wholesaleReady: true,
    metadata: { publicPreview: true, layer: "export_hub" },
  },
  {
    id: "public-logistics-san-pedro",
    nodeType: "logistics_hub",
    layers: ["logistics_hub"],
    name: "Plateforme logistique San Pedro",
    slug: "plateforme-logistique-san-pedro-public",
    description: "Point de coordination logistique pour lots professionnels, inspection et acheminement encadre.",
    country: "CI",
    region: "San-Pedro",
    city: "San-Pedro",
    latitude: 4.7485,
    longitude: -6.6363,
    verificationStatus: "pending",
    companyName: "Logistique partenaire",
    contactName: null,
    contactPhone: null,
    contactWhatsapp: null,
    contactEmail: null,
    wholesaleReady: false,
    metadata: { publicPreview: true, layer: "logistics_hub" },
  },
  {
    id: "public-equipment-yamoussoukro",
    nodeType: "equipment_node",
    layers: ["equipment_node"],
    name: "Support equipement - Yamoussoukro",
    slug: "support-equipement-yamoussoukro-public",
    description: "Signal pour futurs besoins equipements, maintenance et support terrain des operateurs verifies.",
    country: "CI",
    region: "Yamoussoukro",
    city: "Yamoussoukro",
    latitude: 6.8276,
    longitude: -5.2893,
    verificationStatus: "verified",
    companyName: "Support operations",
    contactName: null,
    contactPhone: null,
    contactWhatsapp: null,
    contactEmail: null,
    wholesaleReady: false,
    metadata: { publicPreview: true, layer: "equipment_node" },
  },
];

function summarizeMapNodes(nodes: ProMapNode[]) {
  const verifiedBureaux = nodes.filter((item) => item.layers.includes("bureau_achat") && item.verificationStatus === "verified").length;
  const verifiedExporters = nodes.filter((item) => item.layers.includes("exporter") && item.verificationStatus === "verified").length;
  const activeRegions = new Set(nodes.map((item) => String(item.country || "") + ":" + String(item.region || "")).filter((value) => value !== ":")).size;
  const sourcingNodes = nodes.filter((item) => item.layers.some((layer) => ["mine", "artisanal_zone", "association", "regional_supply_node"].includes(layer))).length;
  return { verifiedBureaux, verifiedExporters, activeRegions, sourcingNodes, totalVisibleNodes: nodes.length };
}

function buildWholesaleSummary(nodes: ProMapNode[]): ProSummaryResponse {
  return {
    ok: true,
    profile: {
      id: "public-wholesale-preview",
      role: "wholesale_preview",
      membershipTier: "free",
      verificationStatus: "public_preview",
      companyName: "BOURSE DE L'OR",
      country: "CI",
      canAccessMap: true,
      canViewSupplyContacts: false,
      canViewMineLayer: true,
      canViewBureauLayer: true,
      canViewExportLayer: true,
    },
    map: {
      variant: "source",
      title: "Marche de gros aurifere",
      subtitle: "Cartographie des mines, zones de sourcing, bureaux d'achat, hubs export et opportunites professionnelles.",
      defaultTypes: ["mine", "artisanal_zone", "association", "regional_supply_node", "bureau_achat", "export_hub", "logistics_hub", "equipment_node"],
      locked: false,
      lockedMessage: null,
    },
    stats: summarizeMapNodes(nodes),
  };
}

function getBdoProCopy(language: string) {
  if (language === "ar") {
    return {
      store: "الذهب المعتمد",
      openMap: "فتح الخريطة",
      mapEyebrow: "الخريطة المهنية",
      unlockTitle: "افتح الوصول المهني",
      lockMessage: "وصول مخصص للأعضاء المهنيين الموثقين.",
      signIn: "تسجيل الدخول",
      seePro: "عرض المساحة المهنية",
      dashboardTitle: "المساحة المهنية",
      dashboardSubtitle: "خريطة مكاتب الشراء والمصدرين ومناطق التوريد للفاعلين المهنيين الموثقين.",
      mapTitle: "الخريطة المهنية",
      mapSubtitle: "شاهد مكاتب الشراء الموثقة والمصدرين ومناطق التوريد.",
      bureauxTitle: "مكاتب شراء موثقة",
      bureauxSubtitle: "حدد مكاتب شراء منظمة لعمليات التوريد أو التنفيذ.",
      exportersTitle: "مصدرون موثقون",
      exportersSubtitle: "راجع الفاعلين الموثقين القادرين على تنظيم الامتثال والشحن للعمليات المهنية.",
      buyersTitle: "مشترون دوليون",
      buyersSubtitle: "حدد الأطراف الموثقة وقارن المحاور الإقليمية وافتح طلبات شراء بالجملة.",
      membershipTitle: "المساحة المهنية - استخبارات الذهب الأفريقي",
      membershipSubtitle: "مساحة مخصصة للمناجم ومكاتب الشراء والتجار والمشترين المؤسسيين.",
      membershipEyebrow: "وصول مهني",
      membershipHeading: "خريطة وأطراف موثقة وتوريد منظم",
      membershipBody:
        "يمكن للجمعيات والمعدنين ومكاتب الشراء الموثقة طلب وصول مناسب. يخضع المشترون الدوليون والمستثمرون لمستوى وصول حسب الملف والمراجعة.",
      eligibility: "الأهلية",
      plans: [
        ["Pro Buyer Basic", "$49 / شهر", "وصول إلى الدليل، مشاهدات محدودة للأطراف وطلبات عروض."],
        ["Pro Buyer Pro", "$199 / شهر", "خريطة كاملة، مصدرون موثقون، توريد منظم ومعلومات محسنة."],
        ["Enterprise", "حسب الطلب", "إعداد مخصص، تدفقات مؤسسية ووصول مخصص للأطراف."],
      ],
      eligibilityItems: [
        "الجمعيات: وصول موثق مناسب",
        "المعدنون: وصول موثق مناسب",
        "مكاتب الشراء: وصول شريك أو موثق",
        "المشترون الدوليون: وصول حسب الاشتراك والمراجعة",
        "المستثمرون: مستوى وصول حسب الملف",
      ],
    };
  }

  if (language === "en") {
    return {
      store: "Certified Gold",
      openMap: "Open map",
      mapEyebrow: "Professional map",
      unlockTitle: "Unlock Pro access",
      lockMessage: "Reserved access for verified Pro members.",
      signIn: "Sign in",
      seePro: "View Professional Space",
      dashboardTitle: "Professional Space",
      dashboardSubtitle: "Access verified buying offices, exporters and gold sourcing zones.",
      mapTitle: "Professional map",
      mapSubtitle: "View verified buying offices, exporters and sourcing zones.",
      bureauxTitle: "Verified buying offices",
      bureauxSubtitle: "Identify structured buying offices for sourcing and execution operations.",
      exportersTitle: "Verified exporters",
      exportersSubtitle: "Review verified operators able to structure compliance and shipment flows.",
      buyersTitle: "International buyers",
      buyersSubtitle: "Find verified counterparties, compare regional hubs and open wholesale requests.",
      membershipTitle: "Professional Space - African gold intelligence",
      membershipSubtitle: "A dedicated space for mines, buying offices, traders and institutional buyers.",
      membershipEyebrow: "Pro access",
      membershipHeading: "Map, counterparties and verified sourcing",
      membershipBody:
        "Verified associations, miners and buying offices can request suitable access. International buyers and investors are reviewed according to the requested level.",
      eligibility: "Eligibility",
      plans: [
        ["Pro Buyer Basic", "$49 / month", "Directory access, limited counterparty views and offer requests."],
        ["Pro Buyer Pro", "$199 / month", "Full map, verified exporters, structured sourcing and enhanced intelligence."],
        ["Enterprise", "Custom", "Dedicated onboarding, institutional flows and custom counterparty access."],
      ],
      eligibilityItems: [
        "Associations: verified access",
        "Miners: verified access",
        "Buying offices: partner or verified access",
        "International buyers: reviewed subscription access",
        "Investors: tiered access according to profile",
      ],
    };
  }

  return {
    store: "Or Estampillé",
    openMap: "Ouvrir la carte",
    mapEyebrow: "Carte professionnelle",
    unlockTitle: "Débloquez l’accès Pro",
    lockMessage: "Accès réservé aux membres Pro vérifiés.",
    signIn: "Se connecter",
    seePro: "Voir l’espace Pro",
    dashboardTitle: "Espace Pro",
    dashboardSubtitle: "Accédez à la cartographie des bureaux d’achat vérifiés, exportateurs et zones de sourcing aurifère.",
    mapTitle: "Carte professionnelle",
    mapSubtitle: "Visualisez les bureaux d’achat vérifiés, exportateurs et zones de sourcing.",
    bureauxTitle: "Bureaux d’achat vérifiés",
    bureauxSubtitle: "Identifiez des bureaux d’achat structurés pour vos opérations d’approvisionnement ou d’exécution.",
    exportersTitle: "Exportateurs vérifiés",
    exportersSubtitle: "Consultez les acteurs vérifiés capables de structurer la conformité et l’expédition des flux professionnels.",
    buyersTitle: "Acheteurs internationaux",
    buyersSubtitle: "Repérez les contreparties vérifiées, comparez les hubs régionaux et ouvrez des demandes wholesale.",
    membershipTitle: "Espace Pro - Intelligence aurifère africaine",
    membershipSubtitle: "Un espace dédié aux mines, bureaux d’achat, négociants et investisseurs.",
    membershipEyebrow: "Accès Pro",
    membershipHeading: "Carte, contreparties et sourcing vérifié",
    membershipBody:
      "Les associations, mineurs et bureaux d’achat vérifiés peuvent obtenir un accès gratuit ou partenaire. Les acheteurs internationaux et investisseurs sont soumis à un accès abonnement selon le niveau demandé.",
    eligibility: "Éligibilité",
    plans: [
      ["Pro Buyer Basic", "$49 / mois", "Accès annuaire, vues contreparties limitées et demandes d’offre."],
      ["Pro Buyer Pro", "$199 / mois", "Carte complète, exportateurs vérifiés, sourcing structuré et intelligence renforcée."],
      ["Enterprise", "Sur mesure", "Onboarding dédié, flux institutionnels et accès personnalisé aux contreparties."],
    ],
    eligibilityItems: [
      "Associations : accès gratuit vérifié",
      "Mineurs : accès gratuit vérifié",
      "Bureaux d’achat : accès partenaire / vérifié",
      "Acheteurs internationaux : abonnement requis",
      "Investisseurs : accès tieré selon profil et abonnement",
    ],
  };
}

function directoryUnlocked(summary: ProSummaryResponse | null) {
  if (!summary) return false;
  return (tierRank[summary.profile.membershipTier] || 0) >= tierRank.pro_basic || summary.profile.role === "admin_internal";
}

function useProSummary(enabled: boolean) {
  return useQuery<ProSummaryResponse>({
    queryKey: ["/api/v2/pro/map/summary"],
    enabled,
    staleTime: 30_000,
    queryFn: () => apiRequest("/api/v2/pro/map/summary"),
  });
}

function useDirectory(path: string, enabled: boolean) {
  return useQuery<DirectoryResponse>({
    queryKey: [path],
    enabled,
    staleTime: 30_000,
    queryFn: () => apiRequest(path),
  });
}

function useLeafletDeps(enabled: boolean) {
  const [deps, setDeps] = useState<LeafletDeps | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      await import("leaflet/dist/leaflet.css");
      const [leaflet, reactLeaflet] = await Promise.all([import("leaflet"), import("react-leaflet")]);
      if (cancelled) return;
      setDeps({
        MapContainer: (reactLeaflet as any).MapContainer,
        TileLayer: (reactLeaflet as any).TileLayer,
        Marker: (reactLeaflet as any).Marker,
        Popup: (reactLeaflet as any).Popup,
        divIcon: (leaflet as any).divIcon,
      });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return deps;
}

function ProShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  return (
    <div className="min-h-screen bg-[#0B0B0D] text-white">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-4 px-3 py-5 md:px-5">
        <section className="rounded-3xl border border-[#D4AF37]/25 bg-[radial-gradient(circle_at_10%_0%,rgba(212,175,55,0.18),transparent_30%),linear-gradient(135deg,#0B0B0D,#0D1B2A_54%,#171205)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.26em] text-[#E8C873]/90">BOURSE DE L'OR</p>
              <h1 className="mt-2 font-['Cinzel'] text-2xl font-semibold text-white md:text-3xl">{title}</h1>
              <p className="mt-2 text-sm text-[#F5F3EC]/78 md:text-base">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/store">
                <Button className="bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]">{copy.store}</Button>
              </Link>
              <Link href="/pro/map">
                <Button variant="outline" className="border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10">
                  {copy.openMap}
                </Button>
              </Link>
            </div>
          </div>
        </section>
        {children}
      </div>
    </div>
  );
}

function AccessLock({ message }: { message?: string }) {
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  return (
    <Card className="border-[#D4AF37]/25 bg-[#0D1B2A]/92">
      <CardContent className="p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">{copy.mapEyebrow}</p>
        <h2 className="mt-2 font-['Cinzel'] text-lg font-semibold text-white">{copy.unlockTitle}</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#F5F3EC]/68">{message || copy.lockMessage}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/admin">
            <Button className="bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]">{copy.signIn}</Button>
          </Link>
          <Link href="/espace-pro">
            <Button variant="outline" className="border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10">
              {copy.seePro}
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ProStats({ summary }: { summary: ProSummaryResponse }) {
  const stats = [
    { label: "Bureaux verifies", value: summary.stats.verifiedBureaux },
    { label: "Exportateurs verifies", value: summary.stats.verifiedExporters },
    { label: "Regions actives", value: summary.stats.activeRegions },
    { label: "Noeuds sourcing", value: summary.stats.sourcingNodes },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((item) => (
        <Card key={item.label} className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DirectoryList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: DirectoryItem[];
}) {
  return (
    <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
      <CardContent className="p-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-white/60">{description}</p>
        </div>
        <div className="mt-4 space-y-3">
          {items.length ? (
            items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-white">{item.companyName}</h3>
                      <Badge className={`border ${statusTone(item.verified)}`}>{item.verified ? "Verifie" : "En cours"}</Badge>
                      {item.wholesaleReady ? (
                        <Badge className="border border-[#D4AF37]/25 bg-[#D4AF37]/12 text-[#F1D27A]">Pret pour le gros</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[12px] text-white/55">{[item.type, item.region, item.country].filter(Boolean).join(" - ")}</p>
                    {(item.activeOffers || item.totalWeightKg) ? (
                      <p className="mt-1 text-[11px] text-[#E8C873]/80">
                        {item.activeOffers ? `${item.activeOffers} offres actives` : null}
                        {item.activeOffers && item.totalWeightKg ? " - " : null}
                        {item.totalWeightKg ? `${item.totalWeightKg.toFixed(2)} kg visibles` : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={item.mapLink}>
                      <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                        Voir sur la carte
                      </Button>
                    </Link>
                    <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                      Contacter
                    </Button>
                    <Button className="bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]">Demander une offre</Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
              Aucune contrepartie disponible pour cette vue.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MapCard({
  nodes,
  summary,
  interactive = false,
  heightClass = "h-[340px]",
}: {
  nodes: ProMapNode[];
  summary: ProSummaryResponse | null;
  interactive?: boolean;
  heightClass?: string;
}) {
  const deps = useLeafletDeps(true);
  const center = useMemo<[number, number]>(() => {
    if (!nodes.length) return [7.54, -5.55];
    const total = nodes.reduce(
      (acc, node) => {
        acc.lat += Number(node.latitude || 0);
        acc.lng += Number(node.longitude || 0);
        return acc;
      },
      { lat: 0, lng: 0 },
    );
    return [total.lat / nodes.length, total.lng / nodes.length];
  }, [nodes]);

  return (
    <Card className="overflow-hidden border-[#D4AF37]/15 bg-[#0D1B2A]/82">
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Carte professionnelle</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{summary?.map.title || "Carte des contreparties auriferes verifiees"}</h2>
            <p className="mt-1 text-sm text-white/60">{summary?.map.subtitle || "Cartographie des acteurs auriferes verifies."}</p>
          </div>
          {summary ? (
            <div className="hidden grid-cols-3 gap-2 md:grid">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Bureaux</p>
                <p className="mt-1 text-sm font-semibold text-white">{summary.stats.verifiedBureaux}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Export</p>
                <p className="mt-1 text-sm font-semibold text-white">{summary.stats.verifiedExporters}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Regions</p>
                <p className="mt-1 text-sm font-semibold text-white">{summary.stats.activeRegions}</p>
              </div>
            </div>
          ) : null}
        </div>
        <div className={`relative ${heightClass}`}>
          {!deps ? (
            <div className="flex h-full items-center justify-center text-sm text-white/55">Chargement de la carte...</div>
          ) : (
            (() => {
              const { MapContainer, TileLayer, Marker, Popup, divIcon } = deps;
              return (
                <MapContainer center={center} zoom={6} className="h-full w-full" zoomControl={interactive}>
                  <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                  {nodes.map((node) => (
                    <Marker
                      key={node.id}
                      position={[node.latitude, node.longitude]}
                      icon={createMapNodeIcon(divIcon, node, interactive)}
                    >
                      <Popup>
                        <div className="min-w-[220px] text-sm text-slate-900">
                          <div className="font-semibold">{node.name}</div>
                          <div className="mt-1 text-xs text-slate-600">{[node.nodeType, node.region, node.country].filter(Boolean).join(" - ")}</div>
                          {node.description ? <div className="mt-2 text-xs text-slate-700">{node.description}</div> : null}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              );
            })()
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProDashboardContent() {
  const { isAuthenticated } = useSession();
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  const [, navigate] = useLocation();
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;

  const previewParams = useMemo(() => {
    if (!summary?.map.defaultTypes?.length) return "verifiedOnly=1";
    const qs = new URLSearchParams();
    qs.set("types", summary.map.defaultTypes.join(","));
    qs.set("verifiedOnly", "1");
    return qs.toString();
  }, [summary?.map.defaultTypes]);

  const previewQuery = useQuery<ProMapResponse>({
    queryKey: ["/api/v2/pro/map/nodes", "preview", previewParams],
    enabled: Boolean(isAuthenticated && summary && !summary.map.locked),
    staleTime: 30_000,
    queryFn: () => apiRequest(`/api/v2/pro/map/nodes?${previewParams}`),
  });

  const bureauxQuery = useDirectory(
    "/api/v2/pro/directory/bureaux-achat",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewBureauLayer),
  );
  const exportersQuery = useDirectory(
    "/api/v2/pro/directory/exporters",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewExportLayer),
  );

  if (!isAuthenticated) {
    return <AccessLock message={copy.dashboardSubtitle} />;
  }
  if (!summary) {
    return <AccessLock message="Chargement du profil Pro..." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <ProStats summary={summary} />
          {summary.map.locked ? (
            <AccessLock message={summary.map.lockedMessage || "Acces reserve aux membres Pro verifies"} />
          ) : (
            <MapCard nodes={previewQuery.data?.items || []} summary={summary} heightClass="h-[340px]" />
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Profil Pro</p>
              <h2 className="mt-1 text-lg font-semibold text-white">{summary.profile.companyName || "Compte professionnel"}</h2>
              <div className="mt-4 space-y-3 text-sm text-white/65">
                <div className="flex items-center justify-between">
                  <span>Role</span>
                  <span className="font-medium text-white">{summary.profile.role.replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Verification</span>
                  <span className="font-medium text-white">{summary.profile.verificationStatus}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Acces carte</span>
                  <span className="font-medium text-white">{summary.profile.canAccessMap ? "Oui" : "Non"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Membership</span>
                  <span className="font-medium text-white">{tierLabels[summary.profile.membershipTier] || summary.profile.membershipTier}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {summary.map.defaultTypes.map((type) => (
                  <Badge key={type} variant="outline" className="border-white/10 bg-white/5 text-white/75">
                    {type.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/pro/map">
                  <Button className="w-full bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]">Ouvrir la carte complete</Button>
                </Link>
                <Link href="/pro/bureaux-achat">
                  <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10">
                    Voir les bureaux d'achat
                  </Button>
                </Link>
                <Link href="/pro/exportateurs-verifies">
                  <Button variant="outline" className="w-full border-white/15 text-white hover:bg-white/10">
                    Voir les exportateurs
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Carte professionnelle</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Acces reserve aux membres Pro verifies</h2>
              <p className="mt-2 text-sm text-white/60">
                Debloquez la cartographie des bureaux d'achat verifies, exportateurs et zones de sourcing aurifere.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DirectoryList
          title="Contreparties verifiees"
          description="Bureaux d'achat verifies et contreparties pretes pour les operations en gros."
          items={(bureauxQuery.data?.items || []).slice(0, 4)}
        />
        <DirectoryList
          title="Exportateurs verifies"
          description="Acteurs capables de structurer les flux export et la conformite documentaire."
          items={(exportersQuery.data?.items || []).slice(0, 4)}
        />
      </div>
    </div>
  );
}

type WholesaleAgentMessage = { role: "assistant" | "user"; text: string };

function wholesaleAgentReply(input: string) {
  const lower = input.toLowerCase();
  if (lower.includes("mine") || lower.includes("zone")) {
    return "Je peux filtrer les zones minieres et signaux de sourcing. Les details sensibles restent soumis a verification Pro, KYC/KYB et revue de conformite.";
  }
  if (lower.includes("cotation") || lower.includes("prix") || lower.includes("offre")) {
    return "Pour une cotation wholesale, il faut preciser le poids vise, le titre, le pays de livraison ou stockage, puis confirmer disponibilite, paiement et conformite.";
  }
  if (lower.includes("equip") || lower.includes("machine")) {
    return "Je peux aussi orienter les demandes d'equipement aurifere vers les noeuds de support et partenaires qualifies lorsque le module est actif.";
  }
  return "Je peux vous aider a reperer bureaux d'achat, zones de sourcing, hubs export et demandes de gros. Selectionnez un filtre ou indiquez le volume recherche.";
}

function WholesaleSourcingAgent({ onTypeSelect }: { onTypeSelect: (types: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<WholesaleAgentMessage[]>([
    {
      role: "assistant",
      text: "Bonjour. Je suis l'agent sourcing BOURSE DE L'OR. Je peux orienter une demande de gros vers mines, bureaux d'achat, hubs export ou support equipement, sous reserve de verification.",
    },
  ]);

  function sendMessage(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setMessages((current) => [...current, { role: "user", text: clean }, { role: "assistant", text: wholesaleAgentReply(clean) }]);
    setDraft("");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(draft);
  }

  const quickActions = [
    { label: "Voir les mines", types: ["mine", "artisanal_zone", "association"] },
    { label: "Bureaux d'achat", types: ["bureau_achat", "regional_supply_node"] },
    { label: "Hubs export", types: ["export_hub", "logistics_hub"] },
    { label: "Equipements", types: ["equipment_node"] },
  ];

  return (
    <Card className="border-[#D4AF37]/20 bg-[#0D1B2A]/88">
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Agent sourcing</p>
        <h2 className="mt-2 font-['Cinzel'] text-lg font-semibold text-white">Bourse de l'Or Concierge Pro</h2>
        <p className="mt-2 text-sm text-white/62">Assistance pour demandes de gros, sourcing responsable, documentation et orientation vers les contreparties verifiees.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                onTypeSelect(action.types);
                sendMessage(action.label);
              }}
              className="rounded-xl border border-[#D4AF37]/20 bg-white/5 px-3 py-2 text-left text-xs font-semibold text-[#F5F3EC] hover:bg-[#D4AF37]/10"
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="mt-4 max-h-[260px] space-y-2 overflow-auto pr-1">
          {messages.map((message, index) => (
            <div
              key={String(index) + message.role}
              className={message.role === "assistant" ? "rounded-2xl border border-white/10 bg-white/6 p-3 text-sm text-white/72" : "ml-8 rounded-2xl bg-[#D4AF37] p-3 text-sm font-medium text-[#0B0B0D]"}
            >
              {message.text}
            </div>
          ))}
        </div>
        <form onSubmit={onSubmit} className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Demande: 5 kg 22K, export, mine, cotation..."
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#050505] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#D4AF37]/70"
          />
          <Button type="submit" className="bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]">Envoyer</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function BdoWholesaleMarketPage() {
  const { isAuthenticated } = useSession();
  const allTypes = useMemo(
    () => ["mine", "artisanal_zone", "association", "regional_supply_node", "bureau_achat", "export_hub", "logistics_hub", "equipment_node"],
    [],
  );
  const [types, setTypes] = useState<string[]>(allTypes);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [wholesaleReady, setWholesaleReady] = useState(false);
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;

  const params = useMemo(() => {
    const qs = new URLSearchParams();
    if (types.length) qs.set("types", types.join(","));
    if (verifiedOnly) qs.set("verifiedOnly", "1");
    if (wholesaleReady) qs.set("wholesaleReady", "1");
    return qs.toString();
  }, [types, verifiedOnly, wholesaleReady]);

  const nodesQuery = useQuery<ProMapResponse>({
    queryKey: ["/api/v2/pro/map/nodes", "wholesale", params],
    enabled: Boolean(isAuthenticated && summary && !summary.map.locked),
    staleTime: 30_000,
    queryFn: () => apiRequest('/api/v2/pro/map/nodes?' + params),
  });

  const sourceNodes = nodesQuery.data?.items?.length ? nodesQuery.data.items : PUBLIC_WHOLESALE_NODES;
  const visibleNodes = useMemo(
    () =>
      sourceNodes.filter((node) => {
        if (types.length && !node.layers.some((layer) => types.includes(layer)) && !types.includes(node.nodeType)) return false;
        if (verifiedOnly && node.verificationStatus !== "verified") return false;
        if (wholesaleReady && !node.wholesaleReady) return false;
        return true;
      }),
    [sourceNodes, types, verifiedOnly, wholesaleReady],
  );
  const displaySummary = useMemo(() => buildWholesaleSummary(visibleNodes), [visibleNodes]);

  return (
    <ProShell
      title="Marche de gros aurifere"
      subtitle="Cartographie des mines, zones de sourcing, bureaux d'achat, hubs export, logistique et opportunites professionnelles. Les contacts et details sensibles restent soumis a verification Pro."
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-4">
          <ProStats summary={displaySummary} />
          <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
            <CardContent className="flex flex-wrap gap-2 p-4">
              {allTypes.map((type) => {
                const active = types.includes(type);
                return (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className={active ? "bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]" : "border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10"}
                    onClick={() => setTypes((current) => (current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]))}
                  >
                    {type.replace(/_/g, " ")}
                  </Button>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant={verifiedOnly ? "default" : "outline"}
                className={verifiedOnly ? "bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]" : "border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10"}
                onClick={() => setVerifiedOnly((value) => !value)}
              >
                Verifies seulement
              </Button>
              <Button
                type="button"
                size="sm"
                variant={wholesaleReady ? "default" : "outline"}
                className={wholesaleReady ? "bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]" : "border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10"}
                onClick={() => setWholesaleReady((value) => !value)}
              >
                Pret pour le gros
              </Button>
            </CardContent>
          </Card>
          <MapCard nodes={visibleNodes} summary={displaySummary} interactive heightClass="h-[640px]" />
        </div>
        <div className="space-y-4">
          <WholesaleSourcingAgent onTypeSelect={setTypes} />
          <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
            <CardContent className="p-4 text-sm text-white/64">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Acces et conformite</p>
              <h2 className="mt-2 text-lg font-semibold text-white">Carte publique, details verifies</h2>
              <p className="mt-2">La carte affiche une vue de travail. Les contacts, volumes disponibles, offres et documents ne sont visibles qu'apres connexion Pro, verification et validation de conformite.</p>
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/pro/login"><Button className="w-full bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]">Acceder a l'espace Pro</Button></Link>
                <Link href="/wholesale/apply"><Button variant="outline" className="w-full border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10">Demander un acces wholesale</Button></Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProShell>
  );
}

export function BdoEspaceProDashboardPage() {
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  return (
    <ProShell
      title={copy.dashboardTitle}
      subtitle={copy.dashboardSubtitle}
    >
      <ProDashboardContent />
    </ProShell>
  );
}

export function BdoProMapPage() {
  const { isAuthenticated } = useSession();
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;
  const [types, setTypes] = useState<string[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [contactAvailable, setContactAvailable] = useState(false);
  const [wholesaleReady, setWholesaleReady] = useState(false);

  useEffect(() => {
    if (!summary?.map.defaultTypes?.length) return;
    const url = new URL(window.location.href);
    const requestedType = String(url.searchParams.get("type") || "").trim();
    if (requestedType) {
      setTypes((current) => (current.includes(requestedType) ? current : [requestedType]));
      return;
    }
    setTypes(summary.map.defaultTypes);
  }, [summary?.map.defaultTypes]);

  const params = useMemo(() => {
    const qs = new URLSearchParams();
    if (types.length) qs.set("types", types.join(","));
    if (verifiedOnly) qs.set("verifiedOnly", "1");
    if (contactAvailable) qs.set("contactAvailable", "1");
    if (wholesaleReady) qs.set("wholesaleReady", "1");
    return qs.toString();
  }, [contactAvailable, types, verifiedOnly, wholesaleReady]);

  const nodesQuery = useQuery<ProMapResponse>({
    queryKey: ["/api/v2/pro/map/nodes", params],
    enabled: Boolean(isAuthenticated && summary && !summary.map.locked),
    staleTime: 30_000,
    queryFn: () => apiRequest(`/api/v2/pro/map/nodes?${params}`),
  });

  return (
    <ProShell
      title={summary?.map.title || copy.mapTitle}
      subtitle={summary?.map.subtitle || copy.mapSubtitle}
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : summary?.map.locked ? (
        <AccessLock message={summary.map.lockedMessage || "Acces reserve aux membres Pro verifies"} />
      ) : (
        <div className="space-y-4">
          {summary ? <ProStats summary={summary} /> : null}
          <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
            <CardContent className="flex flex-wrap gap-2 p-4">
              {(summary?.map.defaultTypes || ["bureau_achat", "exporter", "mine", "association"]).map((type) => {
                const active = types.includes(type);
                return (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className={active ? "bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]" : "border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10"}
                    onClick={() =>
                      setTypes((current) => (current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]))
                    }
                  >
                    {type.replace(/_/g, " ")}
                  </Button>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant={verifiedOnly ? "default" : "outline"}
                className={verifiedOnly ? "bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]" : "border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10"}
                onClick={() => setVerifiedOnly((value) => !value)}
              >
                Verifies seulement
              </Button>
              <Button
                type="button"
                size="sm"
                variant={contactAvailable ? "default" : "outline"}
                className={contactAvailable ? "bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]" : "border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10"}
                onClick={() => setContactAvailable((value) => !value)}
              >
                Contact disponible
              </Button>
              <Button
                type="button"
                size="sm"
                variant={wholesaleReady ? "default" : "outline"}
                className={wholesaleReady ? "bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]" : "border-[#D4AF37]/25 text-[#F5F3EC] hover:bg-[#D4AF37]/10"}
                onClick={() => setWholesaleReady((value) => !value)}
              >
                Pret pour le gros
              </Button>
            </CardContent>
          </Card>
          <MapCard nodes={nodesQuery.data?.items || []} summary={summary} interactive heightClass="h-[520px]" />
        </div>
      )}
    </ProShell>
  );
}

export function BdoProIntelligencePage() {
  const { isAuthenticated } = useSession();
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;

  return (
    <ProShell
      title="Intelligence Pro"
      subtitle="Marches, contreparties, zones actives et chaine export pour les acteurs auriferes verifies."
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : (
        <div className="space-y-4">
          {summary ? <ProStats summary={summary} /> : null}
          <div className="grid gap-4 xl:grid-cols-[1.3fr_minmax(0,1fr)]">
            <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Flux et contreparties</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Lecture rapide du reseau aurifere Pro</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    "Bureaux d'achat verifies accessibles via carte et annuaire.",
                    "Exportateurs et hubs logistiques relies aux parcours wholesale.",
                    "Visibilite graduelle des zones de sourcing selon le tier Pro.",
                    "Passerelle directe vers demandes d'offre et contacts verifies.",
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      {item}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">Conformite & sourcing</p>
                <div className="mt-4 space-y-3">
                  {[
                    "Regles de tracabilite pour les lots professionnels.",
                    "Acces graduel aux couches sensibles selon le tier Pro.",
                    "Cartographie des hubs export, logistique et contreparties verifiees.",
                    "Passerelle entre sourcing regional et execution wholesale.",
                  ].map((item) => (
                    <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                      {item}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ProShell>
  );
}

export function BdoProBureauxPage() {
  const { isAuthenticated } = useSession();
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;
  const query = useDirectory(
    "/api/v2/pro/directory/bureaux-achat",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewBureauLayer),
  );

  return (
    <ProShell
      title={copy.bureauxTitle}
      subtitle={copy.bureauxSubtitle}
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : !summary ? (
        <AccessLock message="Chargement du profil Pro..." />
      ) : !directoryUnlocked(summary) || !summary.profile.canViewBureauLayer ? (
        <AccessLock message="Debloquez l'acces Pro pour consulter les bureaux d'achat verifies." />
      ) : (
        <DirectoryList
          title="Bureaux d'achat"
          description="Annuaire structure des contreparties professionnelles avec lien direct vers la carte."
          items={query.data?.items || []}
        />
      )}
    </ProShell>
  );
}

export function BdoProExportersPage() {
  const { isAuthenticated } = useSession();
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;
  const query = useDirectory(
    "/api/v2/pro/directory/exporters",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewExportLayer),
  );

  return (
    <ProShell
      title={copy.exportersTitle}
      subtitle={copy.exportersSubtitle}
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : !summary ? (
        <AccessLock message="Chargement du profil Pro..." />
      ) : !directoryUnlocked(summary) || !summary.profile.canViewExportLayer ? (
        <AccessLock message="Debloquez l'acces Pro pour consulter les exportateurs verifies." />
      ) : (
        <DirectoryList
          title="Exportateurs et hubs"
          description="Vue liste des exportateurs verifies et hubs export disponibles dans le reseau Pro."
          items={query.data?.items || []}
        />
      )}
    </ProShell>
  );
}

export function BdoProBuyersPage() {
  const { isAuthenticated } = useSession();
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  const summaryQuery = useProSummary(isAuthenticated);
  const summary = summaryQuery.data ?? null;
  const bureauxQuery = useDirectory(
    "/api/v2/pro/directory/bureaux-achat",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewBureauLayer),
  );
  const exportersQuery = useDirectory(
    "/api/v2/pro/directory/exporters",
    Boolean(isAuthenticated && summary && directoryUnlocked(summary) && summary.profile.canViewExportLayer),
  );

  return (
    <ProShell
      title={copy.buyersTitle}
      subtitle={copy.buyersSubtitle}
    >
      {!isAuthenticated ? (
        <AccessLock />
      ) : !summary ? (
        <AccessLock message="Chargement du profil Pro..." />
      ) : !directoryUnlocked(summary) ? (
        <AccessLock message="Debloquez l'acces Pro pour consulter les contreparties et les hubs export." />
      ) : (
        <div className="space-y-4">
          <ProStats summary={summary} />
          <div className="grid gap-4 xl:grid-cols-2">
            <DirectoryList
              title="Bureaux d'achat"
              description="Contreparties verifiees pour les flux d'approvisionnement en gros."
              items={(bureauxQuery.data?.items || []).slice(0, 8)}
            />
            <DirectoryList
              title="Exportateurs"
              description="Acteurs verifies pour la structuration des parcours export."
              items={(exportersQuery.data?.items || []).slice(0, 8)}
            />
          </div>
        </div>
      )}
    </ProShell>
  );
}

export function BdoProCounterpartiesPage() {
  return <BdoProBuyersPage />;
}

export function BdoProMembershipPage() {
  const { language } = useLocale();
  const copy = useMemo(() => getBdoProCopy(language), [language]);
  const plans = copy.plans.map(([title, price, body]) => ({ title, price, copy: body }));

  return (
    <ProShell
      title={copy.membershipTitle}
      subtitle={copy.membershipSubtitle}
    >
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
          <CardContent className="p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">{copy.membershipEyebrow}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{copy.membershipHeading}</h2>
            <p className="mt-2 text-sm text-white/65">{copy.membershipBody}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">{plan.title}</p>
                  <p className="mt-2 text-lg font-semibold text-[#E8C873]">{plan.price}</p>
                  <p className="mt-2 text-sm text-white/60">{plan.copy}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-[#D4AF37]/15 bg-[#0D1B2A]/82">
          <CardContent className="p-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#E8C873]/85">{copy.eligibility}</p>
            <div className="mt-4 space-y-3">
              {copy.eligibilityItems.map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/pro/map">
                <Button className="bg-[#D4AF37] text-[#0B0B0D] hover:bg-[#E8C873]">{copy.openMap}</Button>
              </Link>
              <Link href="/espace-pro">
                <Button variant="outline" className="border-white/15 text-white hover:bg-white/10">
                  {copy.seePro}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProShell>
  );
}
