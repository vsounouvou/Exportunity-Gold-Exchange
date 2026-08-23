import { useEffect } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  FileText,
  Fingerprint,
  LockKeyhole,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";

import { useLocale } from "@/contexts/LocaleContext";

type GovernancePageKey = "privacy" | "terms" | "compliance";

type GovernanceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  sections: Array<{ title: string; body: string }>;
  boundaryTitle: string;
  boundaries: string[];
  accountTitle: string;
  accountBody: string;
  back: string;
  network: string;
  privacy: string;
  terms: string;
  compliance: string;
  access: string;
};

const COPY: Record<"en" | "fr", Record<GovernancePageKey, GovernanceCopy>> = {
  en: {
    privacy: {
      eyebrow: "Privacy and protected records",
      title: "Your information follows the trade record.",
      description:
        "This notice explains how Exportunity handles account, requirement, supplier, offer, order, communication, and operational evidence data.",
      sections: [
        {
          title: "Information we handle",
          body:
            "We may handle account and company details, contact information, commercial requirements, supplier submissions, offer and order records, communications, operational evidence, and technical security events needed to operate the network.",
        },
        {
          title: "Why the information is used",
          body:
            "Information is used to authenticate access, qualify requirements, maintain attributable commercial records, support approved workflows, protect the platform, respond to requests, and meet applicable operational or legal obligations.",
        },
        {
          title: "Protected documents and evidence",
          body:
            "Identity, company, supplier, provenance, inspection, logistics, or compliance files are treated as restricted records. Access is limited by role and purpose; a file is not made public merely because it was uploaded.",
        },
        {
          title: "Service providers and counterparties",
          body:
            "Information is shared only to the extent needed for an authorized workflow, such as verification, communication, payment processing, logistics, support, or infrastructure. Each external action remains subject to its own controls.",
        },
        {
          title: "Retention and security",
          body:
            "Records are retained according to operational, evidentiary, dispute, security, and applicable legal needs. Exportunity uses access controls and audit evidence, but no system can guarantee absolute security.",
        },
        {
          title: "Access, correction, and deletion requests",
          body:
            "You may request access to or correction of relevant account information and may request deletion where permitted. Some records must remain preserved when needed for security, evidence, disputes, or legal obligations.",
        },
      ],
      boundaryTitle: "Privacy boundary",
      boundaries: [
        "No supplier file becomes public automatically.",
        "Sensitive documents require role-based access.",
        "External sharing must belong to an authorized workflow.",
      ],
      accountTitle: "Account-linked requests",
      accountBody:
        "Sign in so a privacy or record request can be associated with the correct Exportunity account and handled through an attributable channel.",
      back: "Back to the network",
      network: "Global Trade Network",
      privacy: "Privacy",
      terms: "Terms",
      compliance: "Compliance",
      access: "Open account access",
    },
    terms: {
      eyebrow: "Terms of network use",
      title: "Clear boundaries for every commercial step.",
      description:
        "These terms govern access to Exportunity’s trade-intelligence, sourcing, coordination, communication, and operational record interfaces.",
      sections: [
        {
          title: "Platform scope",
          body:
            "Exportunity provides digital tools for trade discovery, requirement qualification, supplier review, offer preparation, order records, coordination, and governed operations. A displayed record is not automatically a licence, guarantee, endorsement, or completed transaction.",
        },
        {
          title: "Accounts and authorized use",
          body:
            "You must provide accurate information, protect account credentials, use only permissions assigned to you, and notify Exportunity of suspected unauthorized access. Access may be limited while identity, company, or role information is reviewed.",
        },
        {
          title: "Requirements, suppliers, and evidence",
          body:
            "Requirements and supplier information must be lawful and accurate. Supplier discovery, external documents, and commercial evidence may remain unverified until a responsible reviewer confirms the applicable facts and permitted wording.",
        },
        {
          title: "Offers and orders",
          body:
            "A draft, comparison, or prepared offer does not create an order. Issuance, customer acceptance, order creation, procurement, payment, and fulfilment are separate actions and may require separate evidence and approval.",
        },
        {
          title: "Payments and external services",
          body:
            "Payment status is confirmed only after server-side provider verification and matching of the relevant reference, amount, currency, merchant, customer, and approved commercial record. External providers operate under their own terms and availability.",
        },
        {
          title: "Prohibited activity",
          body:
            "You may not use the platform for fraud, sanctions evasion, unlawful trade, unauthorized access, misleading evidence, abusive automation, interference with the service, or activity that violates applicable law or another party’s rights.",
        },
        {
          title: "Availability and responsibility",
          body:
            "Features and data may change, be corrected, or become unavailable. Users remain responsible for their own commercial, technical, legal, tax, customs, and compliance decisions and for obtaining professional advice when needed.",
        },
        {
          title: "Suspension and changes",
          body:
            "Access or an operation may be delayed, restricted, or suspended to protect users, evidence, the platform, or legal compliance. Material changes to these terms should be published through the platform before they govern future use where required.",
        },
      ],
      boundaryTitle: "Commercial boundary",
      boundaries: [
        "A draft is not an issued offer.",
        "Acceptance does not itself create payment.",
        "Payment and fulfilment require separate verification.",
      ],
      accountTitle: "Use an attributable workspace",
      accountBody:
        "Sign in before handling commercial records so ownership, permissions, approvals, and audit evidence remain attached to the correct account.",
      back: "Back to the network",
      network: "Global Trade Network",
      privacy: "Privacy",
      terms: "Terms",
      compliance: "Compliance",
      access: "Open account access",
    },
    compliance: {
      eyebrow: "Governance and compliance",
      title: "Evidence before claims. Approval before action.",
      description:
        "Exportunity separates discovery, verification, approval, communication, transaction, and fulfilment so sensitive trade activity stays attributable.",
      sections: [
        {
          title: "Identity and business review",
          body:
            "Account, company, representative, beneficial-owner, or role information may be requested when appropriate to the workflow. Access or an operation can remain restricted until required information is reviewed.",
        },
        {
          title: "Supplier and source evidence",
          body:
            "Supplier capabilities, product claims, provenance, licences, certifications, logistics, insurance, and partner relationships must be linked to current attributable evidence before verified public wording or operational reliance.",
        },
        {
          title: "Screening and risk controls",
          body:
            "Relevant transactions or counterparties may require sanctions, fraud, conflict, jurisdiction, source-of-funds, source-of-goods, or other risk checks. The required controls depend on the facts, location, product, and parties involved.",
        },
        {
          title: "Human approval and action separation",
          body:
            "Sensitive actions can require an authorized human reviewer. Research, drafting, approval, sending, acceptance, order creation, payment, procurement, and fulfilment remain separate auditable events.",
        },
        {
          title: "Payment confirmation",
          body:
            "A browser state, redirect, or webhook alone does not prove payment. Provider state must be retrieved and matched server-side to the expected merchant, reference, amount, currency, customer, and commercial record.",
        },
        {
          title: "Public claims and media",
          body:
            "Regulatory, licence, custody, refinery, logistics, insurance, and partner claims render only from current verified records and approved public wording. Supplier media remains restricted until the required scan, consent, approval, retention, and access checks are present.",
        },
      ],
      boundaryTitle: "Governed action boundary",
      boundaries: [
        "Discovery is not verification.",
        "Approval is not external execution.",
        "A webhook alone is not payment confirmation.",
      ],
      accountTitle: "Governed workspace access",
      accountBody:
        "Sign in to work with attributable requirements, approvals, actions, and records. Public browsing does not grant operational authority.",
      back: "Back to the network",
      network: "Global Trade Network",
      privacy: "Privacy",
      terms: "Terms",
      compliance: "Compliance",
      access: "Open account access",
    },
  },
  fr: {
    privacy: {
      eyebrow: "Confidentialité et dossiers protégés",
      title: "Vos informations suivent le dossier commercial.",
      description:
        "Cette notice explique comment Exportunity traite les données de compte, besoins, fournisseurs, offres, commandes, communications et preuves opérationnelles.",
      sections: [
        { title: "Informations traitées", body: "Nous pouvons traiter les données de compte et d’entreprise, coordonnées, besoins commerciaux, réponses fournisseurs, offres, commandes, communications, preuves opérationnelles et événements techniques nécessaires au fonctionnement du réseau." },
        { title: "Finalités", body: "Les informations servent à authentifier l’accès, qualifier les besoins, maintenir des dossiers attribuables, soutenir les parcours autorisés, protéger la plateforme, répondre aux demandes et respecter les obligations opérationnelles ou légales applicables." },
        { title: "Documents et preuves protégés", body: "Les documents d’identité, d’entreprise, de fournisseur, de provenance, d’inspection, de logistique ou de conformité sont des dossiers restreints. Un fichier ne devient pas public du seul fait de son téléversement." },
        { title: "Prestataires et contreparties", body: "Les informations sont partagées uniquement dans la mesure nécessaire à un parcours autorisé, par exemple pour la vérification, la communication, le paiement, la logistique, le support ou l’infrastructure. Chaque action externe conserve ses propres contrôles." },
        { title: "Conservation et sécurité", body: "Les dossiers sont conservés selon les besoins opérationnels, probatoires, de litige, de sécurité et les obligations légales applicables. Exportunity utilise des contrôles d’accès et des preuves d’audit, sans pouvoir garantir une sécurité absolue." },
        { title: "Accès, correction et suppression", body: "Vous pouvez demander l’accès ou la correction d’informations pertinentes et, lorsque la loi le permet, leur suppression. Certains dossiers doivent rester conservés pour la sécurité, les preuves, les litiges ou les obligations légales." },
      ],
      boundaryTitle: "Limite de confidentialité",
      boundaries: ["Aucun dossier fournisseur n’est publié automatiquement.", "Les documents sensibles exigent un accès par rôle.", "Tout partage externe doit appartenir à un parcours autorisé."],
      accountTitle: "Demandes liées au compte",
      accountBody: "Connectez-vous afin qu’une demande de confidentialité ou de dossier soit rattachée au bon compte Exportunity et traitée par un canal attribuable.",
      back: "Retour au réseau", network: "Réseau commercial mondial", privacy: "Confidentialité", terms: "Conditions", compliance: "Conformité", access: "Ouvrir l’accès au compte",
    },
    terms: {
      eyebrow: "Conditions d’utilisation du réseau",
      title: "Des limites claires pour chaque étape commerciale.",
      description: "Ces conditions régissent l’accès aux interfaces Exportunity d’intelligence commerciale, sourcing, coordination, communication et dossiers opérationnels.",
      sections: [
        { title: "Périmètre de la plateforme", body: "Exportunity fournit des outils numériques de découverte, qualification, revue fournisseur, préparation d’offre, dossier de commande, coordination et opérations gouvernées. Un dossier affiché n’est pas automatiquement une licence, une garantie, une recommandation ou une transaction terminée." },
        { title: "Comptes et usage autorisé", body: "Vous devez fournir des informations exactes, protéger vos identifiants, utiliser uniquement les droits attribués et signaler tout accès suspect. L’accès peut rester limité pendant l’examen de l’identité, de l’entreprise ou du rôle." },
        { title: "Besoins, fournisseurs et preuves", body: "Les besoins et informations fournisseurs doivent être licites et exacts. Les découvertes, documents externes et preuves commerciales peuvent rester non vérifiés jusqu’à confirmation des faits et du libellé public autorisé." },
        { title: "Offres et commandes", body: "Un brouillon, une comparaison ou une offre préparée ne crée pas de commande. Émission, acceptation client, création de commande, achat fournisseur, paiement et exécution sont des actions séparées pouvant exiger des preuves et validations distinctes." },
        { title: "Paiements et services externes", body: "Le statut de paiement n’est confirmé qu’après vérification serveur du prestataire et rapprochement de la référence, du montant, de la devise, du marchand, du client et du dossier commercial approuvé." },
        { title: "Activités interdites", body: "La fraude, le contournement de sanctions, le commerce illicite, l’accès non autorisé, les preuves trompeuses, l’automatisation abusive, l’entrave au service et les atteintes aux lois ou droits de tiers sont interdits." },
        { title: "Disponibilité et responsabilité", body: "Les fonctions et données peuvent évoluer, être corrigées ou devenir indisponibles. Chaque utilisateur reste responsable de ses décisions commerciales, techniques, juridiques, fiscales, douanières et de conformité." },
        { title: "Suspension et modifications", body: "Un accès ou une opération peut être retardé, limité ou suspendu pour protéger les utilisateurs, les preuves, la plateforme ou la conformité. Les modifications importantes doivent être publiées avant de régir l’usage futur lorsque cela est requis." },
      ],
      boundaryTitle: "Limite commerciale",
      boundaries: ["Un brouillon n’est pas une offre émise.", "L’acceptation ne crée pas elle-même un paiement.", "Paiement et exécution exigent une vérification séparée."],
      accountTitle: "Utiliser un espace attribuable",
      accountBody: "Connectez-vous avant de traiter des dossiers commerciaux afin que propriété, droits, validations et preuves d’audit restent rattachés au bon compte.",
      back: "Retour au réseau", network: "Réseau commercial mondial", privacy: "Confidentialité", terms: "Conditions", compliance: "Conformité", access: "Ouvrir l’accès au compte",
    },
    compliance: {
      eyebrow: "Gouvernance et conformité",
      title: "Les preuves avant les affirmations. L’approbation avant l’action.",
      description: "Exportunity sépare découverte, vérification, approbation, communication, transaction et exécution afin que toute activité sensible reste attribuable.",
      sections: [
        { title: "Identité et entreprise", body: "Les informations de compte, entreprise, représentant, bénéficiaire effectif ou rôle peuvent être demandées selon le parcours. L’accès ou une opération peut rester limité jusqu’à l’examen des informations requises." },
        { title: "Fournisseurs et preuves de source", body: "Les capacités, produits, provenances, licences, certifications, données logistiques, assurances et relations partenaires doivent être liées à des preuves actuelles et attribuables avant tout libellé public vérifié ou usage opérationnel." },
        { title: "Filtrage et risques", body: "Une transaction ou contrepartie peut nécessiter des contrôles de sanctions, fraude, conflit, juridiction, source des fonds, source des biens ou autres risques. Les contrôles dépendent des faits, du lieu, du produit et des parties." },
        { title: "Approbation humaine et séparation des actions", body: "Les actions sensibles peuvent exiger un réviseur humain autorisé. Recherche, rédaction, approbation, envoi, acceptation, commande, paiement, achat fournisseur et exécution restent des événements séparés et auditables." },
        { title: "Confirmation du paiement", body: "Un état navigateur, une redirection ou un webhook ne prouve pas seul le paiement. L’état prestataire doit être récupéré et rapproché côté serveur avec marchand, référence, montant, devise, client et dossier attendu." },
        { title: "Affirmations publiques et médias", body: "Les affirmations réglementaires, licences, garde, raffinerie, logistique, assurance et partenaires ne s’affichent qu’à partir de dossiers vérifiés et d’un libellé public approuvé. Les médias fournisseurs restent restreints jusqu’aux contrôles requis." },
      ],
      boundaryTitle: "Limite d’action gouvernée",
      boundaries: ["La découverte n’est pas une vérification.", "L’approbation n’est pas l’exécution externe.", "Un webhook seul ne confirme pas un paiement."],
      accountTitle: "Accès à l’espace gouverné",
      accountBody: "Connectez-vous pour travailler avec des besoins, validations, actions et dossiers attribuables. La consultation publique ne confère aucune autorité opérationnelle.",
      back: "Retour au réseau", network: "Réseau commercial mondial", privacy: "Confidentialité", terms: "Conditions", compliance: "Conformité", access: "Ouvrir l’accès au compte",
    },
  },
};

const PAGE_META: Record<GovernancePageKey, { icon: typeof ShieldCheck; testId: string }> = {
  privacy: { icon: LockKeyhole, testId: "exportunity-privacy-page" },
  terms: { icon: Scale, testId: "exportunity-terms-page" },
  compliance: { icon: ShieldCheck, testId: "exportunity-compliance-page" },
};

function GovernanceShell({ pageKey }: { pageKey: GovernancePageKey }) {
  const { language } = useLocale();
  const languageKey = language === "fr" ? "fr" : "en";
  const copy = COPY[languageKey][pageKey];
  const Icon = PAGE_META[pageKey].icon;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = `${copy.title} | Exportunity`;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.setAttribute("content", copy.description);
  }, [copy.description, copy.title]);

  return (
    <div data-testid={PAGE_META[pageKey].testId} className="relative min-h-screen overflow-hidden bg-[#F7F8FA] text-[#07111F]">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute -left-32 top-32 h-96 w-96 rounded-full bg-[#F5A623]/12 blur-3xl" />

      <header className="relative z-20 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            <img src="/tenants/exportunity/official/logo-long-light.png" alt="Exportunity" className="h-9 w-auto max-w-[190px] object-contain" />
            <span className="hidden border-l border-slate-200 pl-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">{copy.network}</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#F5A623] hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" />{copy.back}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
        <section className="max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F5A623]/35 bg-[#FFF8E8] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#8A5700]">
            <Icon className="h-3.5 w-3.5" />{copy.eyebrow}
          </div>
          <h1 className="mt-5 text-4xl font-black leading-[1.04] tracking-[-0.04em] sm:text-5xl lg:text-6xl">{copy.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">{copy.description}</p>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-4">
            {copy.sections.map((section, index) => (
              <article key={section.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
                <div className="flex items-start gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#07111F] text-[#F5A623]">
                    {index % 3 === 0 ? <FileText className="h-5 w-5" /> : index % 3 === 1 ? <Fingerprint className="h-5 w-5" /> : <FileCheck2 className="h-5 w-5" />}
                  </span>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-slate-950">{section.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{section.body}</p>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl bg-[#07111F] p-6 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
              <ShieldCheck className="h-7 w-7 text-[#F5A623]" />
              <h2 className="mt-4 text-lg font-black">{copy.boundaryTitle}</h2>
              <div className="mt-4 space-y-3">
                {copy.boundaries.map((boundary) => (
                  <div key={boundary} className="flex items-start gap-2 text-sm leading-6 text-white/70">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />{boundary}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-[#F5A623]/30 bg-[#FFF8E8] p-6">
              <h2 className="text-lg font-black">{copy.accountTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy.accountBody}</p>
              <Link href="/login" className="mt-5 inline-flex items-center rounded-xl bg-[#F5A623] px-4 py-3 text-sm font-black text-[#07111F] transition hover:bg-[#F8C45B]">{copy.access}</Link>
            </div>
          </aside>
        </div>
      </main>

      <footer className="relative z-10 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Exportunity · {copy.network}</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 font-bold">
            <Link href="/privacy" className="hover:text-slate-950">{copy.privacy}</Link>
            <Link href="/terms" className="hover:text-slate-950">{copy.terms}</Link>
            <Link href="/cadre-conformite" className="hover:text-slate-950">{copy.compliance}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function ExportunityPrivacyPage() {
  return <GovernanceShell pageKey="privacy" />;
}

export function ExportunityTermsPage() {
  return <GovernanceShell pageKey="terms" />;
}

export function ExportunityCompliancePage() {
  return <GovernanceShell pageKey="compliance" />;
}
