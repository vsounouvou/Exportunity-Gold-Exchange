import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Image,
  LockKeyhole,
  Mail,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type SectionKey =
  | "overview"
  | "users"
  | "teams"
  | "participants"
  | "emails"
  | "messages"
  | "tasks"
  | "milestones"
  | "documents"
  | "partners"
  | "sponsors"
  | "media"
  | "content"
  | "settings"
  | "audit";

type FieldKind = "text" | "textarea" | "select" | "date" | "checkbox";

type FieldDef = {
  key: string;
  label: string;
  kind?: FieldKind;
  options?: string[];
  required?: boolean;
  placeholder?: string;
};

const sectionLinks: Array<{ key: SectionKey; href: string; label: string; icon: typeof BarChart3 }> = [
  { key: "overview", href: "/admin/agoojye", label: "Vue d'ensemble", icon: BarChart3 },
  { key: "users", href: "/admin/agoojye/users", label: "Utilisateurs", icon: Users },
  { key: "teams", href: "/admin/agoojye/teams", label: "Équipes", icon: Users },
  { key: "participants", href: "/admin/agoojye/participants", label: "Participants", icon: CheckCircle2 },
  { key: "emails", href: "/admin/agoojye/emails", label: "Emails", icon: Mail },
  { key: "messages", href: "/admin/agoojye/messages", label: "Messages", icon: MessageSquare },
  { key: "tasks", href: "/admin/agoojye/tasks", label: "Tâches", icon: ClipboardList },
  { key: "milestones", href: "/admin/agoojye/milestones", label: "Jalons", icon: CalendarDays },
  { key: "documents", href: "/admin/agoojye/documents", label: "Documents", icon: FileText },
  { key: "partners", href: "/admin/agoojye/partners", label: "Partenaires", icon: ShieldCheck },
  { key: "sponsors", href: "/admin/agoojye/sponsors", label: "Sponsors", icon: Users },
  { key: "media", href: "/admin/agoojye/media", label: "Médias", icon: Image },
  { key: "content", href: "/admin/agoojye/content", label: "Contenu", icon: FileText },
  { key: "settings", href: "/admin/agoojye/settings", label: "Réglages", icon: Settings },
  { key: "audit", href: "/admin/agoojye/audit", label: "Audit", icon: LockKeyhole },
];

const resourceConfig: Record<Exclude<SectionKey, "overview">, { endpoint: string; title: string; description: string; fields: FieldDef[]; columns: string[] }> = {
  users: {
    endpoint: "users",
    title: "Gestion des utilisateurs",
    description: "Créer les profils internes, assigner une équipe, un rôle et confirmer l'éligibilité aux emails officiels.",
    columns: ["displayName", "email", "role", "status", "confirmedRole", "emailAccountCreated"],
    fields: [
      { key: "firstName", label: "Prénom", required: true },
      { key: "lastName", label: "Nom", required: true },
      { key: "displayName", label: "Nom affiché" },
      { key: "email", label: "Email", required: true },
      { key: "phone", label: "Téléphone" },
      { key: "role", label: "Rôle", kind: "select", options: ["Project Director", "Project Coordinator", "Team Lead", "Contributor", "Participant", "Sponsor", "Partner", "Media", "Viewer"] },
      { key: "teamId", label: "ID équipe" },
      { key: "status", label: "Statut", kind: "select", options: ["Invited", "Pending", "Active", "Suspended", "Archived"] },
      { key: "confirmedRole", label: "Rôle confirmé", kind: "checkbox" },
      { key: "bio", label: "Bio", kind: "textarea" },
    ],
  },
  teams: {
    endpoint: "teams",
    title: "Gestion des équipes",
    description: "Créer les départements, missions, leads et visibilité publique.",
    columns: ["name", "mission", "status", "visibility", "leadUserId"],
    fields: [
      { key: "name", label: "Nom", required: true },
      { key: "slug", label: "Slug technique" },
      { key: "mission", label: "Mission", kind: "textarea" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "leadUserId", label: "ID lead" },
      { key: "status", label: "Statut", kind: "select", options: ["active", "forming", "paused", "archived"] },
      { key: "visibility", label: "Visibilité", kind: "select", options: ["public", "private"] },
    ],
  },
  participants: {
    endpoint: "participants",
    title: "Gestion des participants",
    description: "Relier les utilisateurs aux équipes, statuts, compétences et confirmation officielle.",
    columns: ["userId", "teamId", "roleTitle", "participantType", "status", "confirmedRole", "certificateEligible"],
    fields: [
      { key: "userId", label: "ID utilisateur" },
      { key: "teamId", label: "ID équipe" },
      { key: "roleTitle", label: "Rôle projet" },
      { key: "participantType", label: "Type", kind: "select", options: ["student", "engineer", "developer", "designer", "architect", "lawyer", "communicator", "sponsor", "partner", "investor", "admin"] },
      { key: "skills", label: "Compétences (séparées par virgules)" },
      { key: "schoolOrCompany", label: "École / entreprise" },
      { key: "status", label: "Statut", kind: "select", options: ["Pending", "Active", "Suspended", "Archived"] },
      { key: "confirmedRole", label: "Rôle confirmé", kind: "checkbox" },
      { key: "certificateEligible", label: "Certificat éligible", kind: "checkbox" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  emails: {
    endpoint: "email-identities",
    title: "Identités email officielles",
    description: "Créer ou demander les emails agoojiye.com. Les emails individuels exigent un rôle confirmé.",
    columns: ["emailAddress", "displayName", "emailType", "provider", "status", "canSend", "canReceive"],
    fields: [
      { key: "userId", label: "ID utilisateur confirmé" },
      { key: "emailAddress", label: "Adresse email", required: true, placeholder: "prenom.nom@agoojiye.com" },
      { key: "displayName", label: "Nom affiché" },
      { key: "emailType", label: "Type", kind: "select", options: ["individual", "team", "alias", "group", "system"] },
      { key: "provider", label: "Provider", kind: "select", options: ["manual", "google_workspace", "zoho", "proton", "smtp"] },
      { key: "status", label: "Statut", kind: "select", options: ["requested", "provisioned", "active", "suspended", "archived"] },
      { key: "forwardingAddress", label: "Transfert vers" },
      { key: "canSend", label: "Peut envoyer", kind: "checkbox" },
      { key: "canReceive", label: "Peut recevoir", kind: "checkbox" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  messages: {
    endpoint: "messages",
    title: "Messages internes",
    description: "Envoyer un message à un utilisateur, une équipe ou l'ensemble du tenant.",
    columns: ["subject", "messageType", "senderUserId", "teamId", "createdAt"],
    fields: [
      { key: "senderUserId", label: "ID expéditeur" },
      { key: "teamId", label: "ID équipe destinataire" },
      { key: "recipientUserIds", label: "IDs utilisateurs destinataires" },
      { key: "subject", label: "Sujet", required: true },
      { key: "messageType", label: "Type", kind: "select", options: ["direct", "team", "announcement"] },
      { key: "body", label: "Message", kind: "textarea", required: true },
    ],
  },
  tasks: {
    endpoint: "tasks",
    title: "Tâches",
    description: "Suivre les tâches par équipe, priorité, responsable, statut et jalon.",
    columns: ["title", "priority", "status", "teamId", "assignedTo", "dueDate"],
    fields: [
      { key: "title", label: "Titre", required: true },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "teamId", label: "ID équipe" },
      { key: "assignedTo", label: "ID assigné" },
      { key: "priority", label: "Priorité", kind: "select", options: ["low", "medium", "high", "critical"] },
      { key: "status", label: "Statut", kind: "select", options: ["todo", "in_progress", "blocked", "review", "done"] },
      { key: "dueDate", label: "Date limite", kind: "date" },
      { key: "milestoneId", label: "ID jalon" },
    ],
  },
  milestones: {
    endpoint: "milestones",
    title: "Jalons et timeline",
    description: "Les jalons publics alimentent les pages Histoire et Challenge.",
    columns: ["title", "date", "status", "owner", "visibility", "sortOrder"],
    fields: [
      { key: "title", label: "Titre", required: true },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "date", label: "Date", kind: "date" },
      { key: "status", label: "Statut", kind: "select", options: ["planned", "in_progress", "done", "delayed"] },
      { key: "owner", label: "Responsable" },
      { key: "visibility", label: "Visibilité", kind: "select", options: ["public", "private"] },
      { key: "sortOrder", label: "Ordre" },
    ],
  },
  documents: {
    endpoint: "documents",
    title: "Documents",
    description: "Gérer stratégie, juridique, sponsor, technique, média, NDA, contrats et notes.",
    columns: ["title", "category", "status", "visibility", "version", "fileUrl"],
    fields: [
      { key: "title", label: "Titre", required: true },
      { key: "category", label: "Catégorie", kind: "select", options: ["Strategy", "Legal", "Sponsorship", "Technical", "Design", "Software", "Communication", "Media", "Partner documents", "Participant documents", "NDA", "Contracts", "Meeting notes"] },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "fileUrl", label: "URL fichier" },
      { key: "version", label: "Version" },
      { key: "status", label: "Statut", kind: "select", options: ["draft", "under_review", "approved", "archived"] },
      { key: "visibility", label: "Visibilité", kind: "select", options: ["public", "private", "team_only", "admin_only"] },
    ],
  },
  partners: {
    endpoint: "partners",
    title: "Partenaires",
    description: "Ne jamais surestimer un statut : chaque partenaire doit avoir une catégorie et un statut explicite.",
    columns: ["name", "category", "status", "visibility", "contactPerson", "website"],
    fields: [
      { key: "name", label: "Nom", required: true },
      { key: "category", label: "Catégorie", kind: "select", options: ["Initiator", "Co-lead / Accelerator Partner", "Industrial Partners", "Technical Partners", "Schools & Universities", "Sponsors", "Media Partners", "Institutional Partners", "Supplier Partners", "Investor"] },
      { key: "status", label: "Statut", kind: "select", options: ["Confirmed", "In discussion", "Sponsor prospect", "Technical contributor", "Institutional stakeholder", "Media partner", "Supplier", "Prospect", "Paused", "Rejected", "Archived"] },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "contactPerson", label: "Contact" },
      { key: "contactEmail", label: "Email contact" },
      { key: "contactPhone", label: "Téléphone contact" },
      { key: "website", label: "Site web" },
      { key: "visibility", label: "Visibilité", kind: "select", options: ["public", "private"] },
      { key: "notes", label: "Notes internes", kind: "textarea" },
    ],
  },
  sponsors: {
    endpoint: "sponsors",
    title: "CRM sponsors",
    description: "Les formulaires publics créent des leads ici. Suivre statut, budget, affectation et notes.",
    columns: ["companyName", "contactPerson", "email", "interest", "budgetRange", "status", "source"],
    fields: [
      { key: "companyName", label: "Entreprise", required: true },
      { key: "contactPerson", label: "Contact", required: true },
      { key: "email", label: "Email", required: true },
      { key: "phone", label: "Téléphone" },
      { key: "interest", label: "Intérêt" },
      { key: "budgetRange", label: "Budget" },
      { key: "message", label: "Message", kind: "textarea" },
      { key: "status", label: "Statut", kind: "select", options: ["New", "Contacted", "In discussion", "Package sent", "Committed", "Paid", "Rejected", "Archived"] },
      { key: "assignedTo", label: "ID assigné" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  media: {
    endpoint: "media",
    title: "Médias",
    description: "Gérer images, vidéos, assets officiels, galerie, coulisses et documentaire.",
    columns: ["title", "mediaType", "category", "status", "visibility", "fileUrl"],
    fields: [
      { key: "title", label: "Titre", required: true },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "mediaType", label: "Type", kind: "select", options: ["image", "video", "press_release", "brand_asset", "documentary", "gallery"] },
      { key: "fileUrl", label: "URL fichier" },
      { key: "thumbnailUrl", label: "URL miniature" },
      { key: "category", label: "Catégorie" },
      { key: "status", label: "Statut", kind: "select", options: ["draft", "published", "archived"] },
      { key: "visibility", label: "Visibilité", kind: "select", options: ["public", "private"] },
      { key: "tags", label: "Tags" },
    ],
  },
  content: {
    endpoint: "content",
    title: "CMS léger",
    description: "Préparer la traduction avec title_fr/title_en et content_fr/content_en.",
    columns: ["page", "section", "key", "titleFr", "updatedBy", "updatedAt"],
    fields: [
      { key: "page", label: "Page", required: true },
      { key: "section", label: "Section", required: true },
      { key: "key", label: "Clé", required: true },
      { key: "titleFr", label: "Titre FR" },
      { key: "titleEn", label: "Titre EN" },
      { key: "contentFr", label: "Contenu FR", kind: "textarea" },
      { key: "contentEn", label: "Contenu EN", kind: "textarea" },
      { key: "imageUrl", label: "Image URL" },
    ],
  },
  settings: {
    endpoint: "email-settings",
    title: "Réglages email tenant",
    description: "Configurer le provider SMTP sans afficher le secret après sauvegarde. Préférer SMTP_PASSWORD en variable d'environnement.",
    columns: ["providerName", "status", "smtpHost", "smtpPort", "smtpUsername", "fromEmail", "replyToEmail", "smtpPasswordEncrypted"],
    fields: [
      { key: "providerName", label: "Provider", kind: "select", options: ["manual", "smtp", "google_workspace", "zoho", "proton"] },
      { key: "status", label: "Statut", kind: "select", options: ["not_configured", "configured", "testing", "active", "disabled"] },
      { key: "smtpHost", label: "SMTP host" },
      { key: "smtpPort", label: "SMTP port" },
      { key: "smtpUsername", label: "SMTP username" },
      { key: "fromName", label: "From name" },
      { key: "fromEmail", label: "From email" },
      { key: "replyToEmail", label: "Reply-to email" },
    ],
  },
  audit: {
    endpoint: "audit",
    title: "Audit logs",
    description: "Journal des actions admin AGOOJYÉ.",
    columns: ["actor", "action", "entityType", "entityId", "createdAt"],
    fields: [
      { key: "action", label: "Action" },
      { key: "entityType", label: "Entité" },
      { key: "entityId", label: "ID entité" },
    ],
  },
};

const adminLabelMap: Record<string, string> = {
  displayName: "Nom affiché",
  email: "Email",
  role: "Rôle",
  status: "Statut",
  confirmedRole: "Rôle confirmé",
  emailAccountCreated: "Email créé",
  name: "Nom",
  mission: "Mission",
  visibility: "Visibilité",
  leadUserId: "ID lead",
  userId: "ID utilisateur",
  teamId: "ID équipe",
  roleTitle: "Rôle projet",
  participantType: "Type participant",
  certificateEligible: "Certificat éligible",
  emailAddress: "Adresse email",
  emailType: "Type email",
  provider: "Provider",
  canSend: "Envoi",
  canReceive: "Réception",
  subject: "Sujet",
  messageType: "Type message",
  senderUserId: "ID expéditeur",
  createdAt: "Créé le",
  title: "Titre",
  priority: "Priorité",
  assignedTo: "ID assigné",
  dueDate: "Date limite",
  date: "Date",
  owner: "Responsable",
  sortOrder: "Ordre",
  category: "Catégorie",
  version: "Version",
  fileUrl: "URL fichier",
  contactPerson: "Contact",
  website: "Site web",
  companyName: "Entreprise",
  interest: "Intérêt",
  budgetRange: "Budget",
  source: "Source",
  mediaType: "Type média",
  page: "Page",
  section: "Section",
  key: "Clé",
  titleFr: "Titre FR",
  updatedBy: "Mis à jour par",
  updatedAt: "Mis à jour le",
  providerName: "Provider",
  smtpHost: "SMTP host",
  smtpPort: "SMTP port",
  smtpUsername: "SMTP username",
  fromEmail: "From email",
  replyToEmail: "Reply-to email",
  smtpPasswordEncrypted: "Secret SMTP",
  actor: "Acteur",
  action: "Action",
  entityType: "Entité",
  entityId: "ID entité",
  "Project Director": "Directeur de projet",
  "Project Coordinator": "Coordinateur projet",
  "Team Lead": "Lead équipe",
  Contributor: "Contributeur",
  Participant: "Participant",
  Sponsor: "Sponsor",
  Partner: "Partenaire",
  Media: "Média",
  Viewer: "Lecteur",
  Invited: "Invité",
  Pending: "En attente",
  Active: "Actif",
  Suspended: "Suspendu",
  Archived: "Archivé",
  active: "actif",
  forming: "en formation",
  paused: "en pause",
  archived: "archivé",
  public: "public",
  private: "privé",
  student: "étudiant",
  engineer: "ingénieur",
  developer: "développeur",
  designer: "designer",
  architect: "architecte",
  lawyer: "juriste",
  communicator: "communicant",
  sponsor: "sponsor",
  partner: "partenaire",
  investor: "investisseur",
  admin: "admin",
  individual: "individuel",
  team: "équipe",
  alias: "alias",
  group: "groupe",
  system: "système",
  manual: "manuel",
  google_workspace: "Google Workspace",
  zoho: "Zoho",
  proton: "Proton",
  smtp: "SMTP",
  requested: "demandé",
  provisioned: "provisionné",
  suspended: "suspendu",
  direct: "direct",
  announcement: "annonce",
  low: "faible",
  medium: "moyenne",
  high: "haute",
  critical: "critique",
  todo: "à faire",
  in_progress: "en cours",
  blocked: "bloqué",
  review: "revue",
  done: "terminé",
  planned: "planifié",
  delayed: "retardé",
  Strategy: "Stratégie",
  Legal: "Juridique",
  Sponsorship: "Sponsoring",
  Technical: "Technique",
  Design: "Design",
  Software: "Logiciel",
  Communication: "Communication",
  "Partner documents": "Documents partenaires",
  "Participant documents": "Documents participants",
  NDA: "NDA",
  Contracts: "Contrats",
  "Meeting notes": "Comptes rendus",
  draft: "brouillon",
  under_review: "en revue",
  approved: "approuvé",
  team_only: "équipe seulement",
  admin_only: "admin seulement",
  Initiator: "Initiateur",
  "Co-lead / Accelerator Partner": "Co-lead / partenaire accélérateur",
  "Industrial Partners": "Partenaires industriels",
  "Technical Partners": "Partenaires techniques",
  "Schools & Universities": "Écoles & universités",
  Sponsors: "Sponsors",
  "Media Partners": "Partenaires médias",
  "Institutional Partners": "Partenaires institutionnels",
  "Supplier Partners": "Fournisseurs partenaires",
  Investor: "Investisseur",
  Confirmed: "Confirmé",
  "In discussion": "En discussion",
  Prospect: "Prospect",
  "Sponsor prospect": "Sponsor prospect",
  "Technical contributor": "Contributeur technique",
  "Institutional stakeholder": "Partie prenante institutionnelle",
  "Media partner": "Partenaire média",
  Supplier: "Fournisseur",
  Rejected: "Rejeté",
  New: "Nouveau",
  Contacted: "Contacté",
  "Package sent": "Dossier envoyé",
  Committed: "Engagé",
  Paid: "Payé",
  image: "image",
  video: "vidéo",
  press_release: "communiqué",
  brand_asset: "asset marque",
  documentary: "documentaire",
  gallery: "galerie",
  published: "publié",
  not_configured: "non configuré",
  configured: "configuré",
  testing: "test",
  disabled: "désactivé",
};

function adminLabel(value: string) {
  return adminLabelMap[value] || value;
}

function AdminShell({ section, children }: { section: SectionKey; children: ReactNode }) {
  return (
    <div className="min-h-full bg-[#080808] p-4 text-[#F7F2E8]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C99A36]">AGOOJYÉ Operating Platform</p>
          <h1 className="mt-2 text-2xl font-semibold">Siège numérique du projet</h1>
          <p className="mt-1 text-sm text-[#B8AE9D]">Tenant distinct: AGOOJYÉ Electric Mobility / agoojye / langue par défaut: français.</p>
        </div>
        <a href="/" className="w-fit rounded-md border border-[#C99A36]/40 px-3 py-2 text-xs font-semibold text-[#E4C46A] hover:bg-[#C99A36]/10">
          Site public
        </a>
      </div>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {sectionLinks.map(({ key, href, label, icon: Icon }) => (
          <a
            key={key}
            href={href}
            className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs ${
              section === key ? "border-[#C99A36] bg-[#C99A36] text-[#080808]" : "border-white/15 bg-white/5 text-[#D8CFBF] hover:bg-white/10"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </a>
        ))}
      </nav>
      {children}
    </div>
  );
}

function useDashboard() {
  return useQuery<{ ok: boolean; metrics: Record<string, number>; bootstrap: Record<string, any> }>({
    queryKey: ["/api/admin/agoojye/dashboard"],
    queryFn: () => apiRequest("/api/admin/agoojye/dashboard", "GET"),
  });
}

function useResource(endpoint: string) {
  return useQuery<{ ok: boolean; items: any[] }>({
    queryKey: [`/api/admin/agoojye/${endpoint}`],
    queryFn: () => apiRequest(`/api/admin/agoojye/${endpoint}`, "GET"),
  });
}

export function AgoojyeAdminDashboardPage() {
  const dashboard = useDashboard();
  const metrics = dashboard.data?.metrics || {};
  return (
    <AdminShell section="overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="rounded-md border border-[#C99A36]/20 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-wide text-[#B8AE9D]">{metricLabel(key)}</p>
            <p className="mt-2 text-2xl font-semibold text-[#E4C46A]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-md border border-white/15 bg-white/5 p-4">
          <h2 className="font-semibold">Priorités de lancement</h2>
          <div className="mt-3 grid gap-2 text-sm text-[#D8CFBF]">
            {[
              "Créer les premiers utilisateurs et confirmer les rôles officiels.",
              "Créer les identités email individuelles uniquement après confirmation.",
              "Mettre à jour les jalons publics du challenge.",
              "Qualifier les partenaires et éviter tout statut exagéré.",
              "Suivre les leads sponsors issus du formulaire public.",
            ].map((item) => (
              <div key={item} className="flex gap-2 rounded border border-white/10 bg-black/20 px-3 py-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#C99A36]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-md border border-white/15 bg-white/5 p-4">
          <h2 className="font-semibold">Provisioning email manuel</h2>
          <ol className="mt-3 space-y-2 text-sm text-[#D8CFBF]">
            <li>1. Vérifier que le participant a un rôle confirmé.</li>
            <li>2. Créer l'identité dans AGOOJYÉ.</li>
            <li>3. Provisionner dans Google Workspace, Zoho, Proton ou SMTP.</li>
            <li>4. Marquer le statut comme provisioned puis active.</li>
            <li>5. Envoyer l'invitation au participant.</li>
          </ol>
        </section>
      </div>
    </AdminShell>
  );
}

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    totalParticipants: "Participants",
    confirmedRoles: "Rôles confirmés",
    emailsCreated: "Emails créés",
    activeTeams: "Équipes actives",
    openTasks: "Tâches ouvertes",
    upcomingMilestones: "Jalons",
    sponsorLeads: "Leads sponsors",
    partnerLeads: "Partenaires",
    documentsPendingReview: "Docs à revoir",
    mediaAssets: "Médias",
  };
  return labels[key] || key;
}

function ResourcePage({ section }: { section: Exclude<SectionKey, "overview"> }) {
  const config = resourceConfig[section];
  const queryClient = useQueryClient();
  const query = useResource(config.endpoint);
  const [form, setForm] = useState<Record<string, any>>(() => initialForm(config.fields));

  const createMutation = useMutation({
    mutationFn: () => {
      const existingSettings = section === "settings" ? query.data?.items?.[0] : null;
      if (existingSettings?.id) {
        return apiRequest(`/api/admin/agoojye/${config.endpoint}/${existingSettings.id}`, "PATCH", form);
      }
      return apiRequest(`/api/admin/agoojye/${config.endpoint}`, "POST", form);
    },
    onSuccess: () => {
      setForm(initialForm(config.fields));
      queryClient.invalidateQueries({ queryKey: [`/api/admin/agoojye/${config.endpoint}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agoojye/dashboard"] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) => apiRequest(`/api/admin/agoojye/${config.endpoint}/${id}`, "PATCH", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/agoojye/${config.endpoint}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agoojye/dashboard"] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <AdminShell section={section}>
      <section className="rounded-md border border-white/15 bg-white/5 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{config.title}</h2>
            <p className="mt-1 max-w-4xl text-sm text-[#B8AE9D]">{config.description}</p>
          </div>
          <span className="rounded border border-[#C99A36]/35 px-2 py-1 text-xs text-[#E4C46A]">{query.data?.items?.length || 0} entrées</span>
        </div>
        {section === "emails" ? <EmailChecklist /> : null}
        {section === "settings" ? <SettingsNotice /> : null}
        {section !== "audit" ? (
          <form onSubmit={submit} className="mt-4 grid gap-3 rounded-md border border-white/10 bg-black/20 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {config.fields.map((field) => (
                <EditorField key={field.key} field={field} value={form[field.key]} onChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))} />
              ))}
            </div>
            {createMutation.isError ? <p className="text-sm text-red-300">{String((createMutation.error as Error)?.message || "Erreur")}</p> : null}
            {createMutation.isSuccess ? <p className="text-sm text-[#E4C46A]">Entrée créée.</p> : null}
            <button disabled={createMutation.isPending} className="w-fit rounded-md bg-[#C99A36] px-4 py-2 text-sm font-semibold text-[#080808]">
              {createMutation.isPending ? "Enregistrement..." : "Créer"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="mt-4 overflow-hidden rounded-md border border-white/15 bg-white/5">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/30 text-xs uppercase tracking-wide text-[#B8AE9D]">
              <tr>
                <th className="px-3 py-3">ID</th>
                {config.columns.map((column) => (
                  <th key={column} className="px-3 py-3">{adminLabel(column)}</th>
                ))}
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.items || []).map((item) => (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="px-3 py-3 text-[#E4C46A]">{item.id}</td>
                  {config.columns.map((column) => (
                    <td key={column} className="max-w-[260px] px-3 py-3 text-[#D8CFBF]">
                      <CellValue value={item[column]} />
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <QuickActions section={section} item={item} onPatch={(patch) => patchMutation.mutate({ id: Number(item.id), patch })} pending={patchMutation.isPending} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}

function initialForm(fields: FieldDef[]) {
  const out: Record<string, any> = {};
  for (const field of fields) {
    if (field.kind === "checkbox") out[field.key] = field.key === "canSend" || field.key === "canReceive";
    else if (field.options?.length) out[field.key] = field.options[0];
    else out[field.key] = "";
  }
  return out;
}

function EditorField({ field, value, onChange }: { field: FieldDef; value: any; onChange: (value: any) => void }) {
  const base = "mt-1 w-full rounded-md border border-white/15 bg-[#080808] px-3 py-2 text-sm text-[#F7F2E8] outline-none focus:border-[#C99A36]";
  if (field.kind === "checkbox") {
    return (
      <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.kind === "textarea") {
    return (
      <label className="text-sm text-[#D8CFBF] xl:col-span-2">
        {field.label}
        <textarea required={field.required} value={value || ""} onChange={(event) => onChange(event.target.value)} rows={3} className={base} placeholder={field.placeholder} />
      </label>
    );
  }
  if (field.kind === "select") {
    return (
      <label className="text-sm text-[#D8CFBF]">
        {field.label}
        <select value={value || ""} onChange={(event) => onChange(event.target.value)} className={base}>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>{adminLabel(option)}</option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="text-sm text-[#D8CFBF]">
      {field.label}
      <input required={field.required} type={field.kind === "date" ? "date" : "text"} value={value || ""} onChange={(event) => onChange(event.target.value)} className={base} placeholder={field.placeholder} />
    </label>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return <span className="text-white/35">—</span>;
  if (typeof value === "boolean") return <span className={value ? "text-emerald-300" : "text-white/45"}>{value ? "oui" : "non"}</span>;
  if (Array.isArray(value)) return <span>{value.join(", ")}</span>;
  if (typeof value === "object") return <code className="text-xs">{JSON.stringify(value)}</code>;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return <span>{new Date(raw).toLocaleString("fr-FR")}</span>;
  return <span className="break-words">{adminLabel(raw)}</span>;
}

function QuickActions({ section, item, onPatch, pending }: { section: SectionKey; item: any; onPatch: (patch: Record<string, unknown>) => void; pending?: boolean }) {
  const actions = useMemo(() => {
    if (section === "users") {
      return [
        { label: item.confirmedRole ? "Retirer confirmation" : "Confirmer rôle", patch: { confirmedRole: !item.confirmedRole, status: item.status === "Invited" ? "Active" : item.status } },
        { label: "Activer", patch: { status: "Active" } },
      ];
    }
    if (section === "participants") {
      return [
        { label: item.confirmedRole ? "Non confirmé" : "Confirmer", patch: { confirmedRole: !item.confirmedRole, status: item.status === "Pending" ? "Active" : item.status } },
        { label: "Certificat", patch: { certificateEligible: true } },
      ];
    }
    if (section === "emails") {
      return [
        { label: "Provisionné", patch: { status: "provisioned" } },
        { label: "Actif", patch: { status: "active" } },
      ];
    }
    if (section === "tasks") {
      return [
        { label: "En cours", patch: { status: "in_progress" } },
        { label: "Terminé", patch: { status: "done" } },
      ];
    }
    if (section === "sponsors") {
      return [
        { label: "Contacté", patch: { status: "Contacted" } },
        { label: "Package envoyé", patch: { status: "Package sent" } },
      ];
    }
    if (section === "partners") {
      return [
        { label: "Confirmer", patch: { status: "Confirmed" } },
        { label: "Privé", patch: { visibility: "private" } },
      ];
    }
    if (section === "documents") {
      return [
        { label: "Revue", patch: { status: "under_review" } },
        { label: "Approuver", patch: { status: "approved" } },
      ];
    }
    if (section === "milestones" || section === "media") {
      return [
        { label: "Public", patch: { visibility: "public" } },
        { label: "Privé", patch: { visibility: "private" } },
      ];
    }
    return [];
  }, [item, section]);

  if (!actions.length) return <span className="text-xs text-white/35">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {actions.map((action) => (
        <button key={action.label} disabled={pending} onClick={() => onPatch(action.patch)} className="rounded border border-[#C99A36]/35 px-2 py-1 text-xs text-[#E4C46A] hover:bg-[#C99A36]/10">
          {action.label}
        </button>
      ))}
    </div>
  );
}

function EmailChecklist() {
  return (
    <div className="mt-4 rounded-md border border-[#C99A36]/25 bg-[#080808] p-4 text-sm text-[#D8CFBF]">
      <p className="font-semibold text-[#E4C46A]">Checklist provisioning manuel</p>
      <p className="mt-2">Confirmer le rôle, choisir le format email, créer l'entrée, provisionner chez le provider, puis passer le statut à provisioned/active. Aucun mot de passe de boîte email n'est stocké ici.</p>
    </div>
  );
}

function SettingsNotice() {
  return (
    <div className="mt-4 rounded-md border border-[#C99A36]/25 bg-[#080808] p-4 text-sm text-[#D8CFBF]">
      <p className="font-semibold text-[#E4C46A]">Secrets SMTP</p>
      <p className="mt-2">Utiliser de préférence SMTP_PASSWORD dans l'environnement serveur. L'interface ne réaffiche pas le secret après sauvegarde.</p>
    </div>
  );
}

export function AgoojyeAdminUsersPage() {
  return <ResourcePage section="users" />;
}

export function AgoojyeAdminTeamsPage() {
  return <ResourcePage section="teams" />;
}

export function AgoojyeAdminParticipantsPage() {
  return <ResourcePage section="participants" />;
}

export function AgoojyeAdminEmailsPage() {
  return <ResourcePage section="emails" />;
}

export function AgoojyeAdminMessagesPage() {
  return <ResourcePage section="messages" />;
}

export function AgoojyeAdminTasksPage() {
  return <ResourcePage section="tasks" />;
}

export function AgoojyeAdminMilestonesPage() {
  return <ResourcePage section="milestones" />;
}

export function AgoojyeAdminDocumentsPage() {
  return <ResourcePage section="documents" />;
}

export function AgoojyeAdminPartnersPage() {
  return <ResourcePage section="partners" />;
}

export function AgoojyeAdminSponsorsPage() {
  return <ResourcePage section="sponsors" />;
}

export function AgoojyeAdminMediaPage() {
  return <ResourcePage section="media" />;
}

export function AgoojyeAdminContentPage() {
  return <ResourcePage section="content" />;
}

export function AgoojyeAdminSettingsPage() {
  return <ResourcePage section="settings" />;
}

export function AgoojyeAdminAuditPage() {
  return <ResourcePage section="audit" />;
}
