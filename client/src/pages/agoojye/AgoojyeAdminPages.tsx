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
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { AdminEmailControlCenterPage } from "@/pages/AdminEmailControlCenterPage";
import { AdminHumanEmailAccountsPanel } from "@/pages/AdminHumanEmailAccountsPanel";

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
  | "sponsorCategories"
  | "pipelineStages"
  | "organizations"
  | "contacts"
  | "opportunities"
  | "activities"
  | "emailTemplates"
  | "toolbox"
  | "suppression"
  | "approvals"
  | "inboxThreads"
  | "mailMessages"
  | "sequences"
  | "imports"
  | "agentResearch"
  | "jobs"
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
  { key: "sponsorCategories", href: "/admin/agoojye/sponsor-categories", label: "Catégories sponsors", icon: ShieldCheck },
  { key: "pipelineStages", href: "/admin/agoojye/pipeline-stages", label: "Étapes pipeline", icon: ClipboardList },
  { key: "organizations", href: "/admin/agoojye/organizations", label: "Organisations", icon: Users },
  { key: "contacts", href: "/admin/agoojye/contacts", label: "Contacts CRM", icon: Users },
  { key: "opportunities", href: "/admin/agoojye/opportunities", label: "Pipeline sponsors", icon: ClipboardList },
  { key: "activities", href: "/admin/agoojye/activities", label: "Activités CRM", icon: MessageSquare },
  { key: "emailTemplates", href: "/admin/agoojye/email-templates", label: "Modèles email", icon: Mail },
  { key: "toolbox", href: "/admin/agoojye/toolbox", label: "Sponsor Toolbox", icon: FileText },
  { key: "suppression", href: "/admin/agoojye/suppression", label: "Suppressions", icon: LockKeyhole },
  { key: "approvals", href: "/admin/agoojye/approvals", label: "Approbations", icon: CheckCircle2 },
  { key: "inboxThreads", href: "/admin/agoojye/inbox", label: "Boîte de réception", icon: MessageSquare },
  { key: "mailMessages", href: "/admin/agoojye/mail-messages", label: "Messages email", icon: Mail },
  { key: "sequences", href: "/admin/agoojye/sequences", label: "Séquences", icon: RefreshCw },
  { key: "imports", href: "/admin/agoojye/imports", label: "Imports", icon: FileText },
  { key: "agentResearch", href: "/admin/agoojye/agent-research", label: "Agent recherche", icon: Search },
  { key: "jobs", href: "/admin/agoojye/jobs", label: "Jobs système", icon: RefreshCw },
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
  sponsorCategories: {
    endpoint: "sponsor-categories",
    title: "Catégories sponsors",
    description: "Classer les cibles par valeur concrète: fondateur, talents, industriel, énergie, média ou institutionnel.",
    columns: ["name", "slug", "status", "sortOrder"],
    fields: [
      { key: "name", label: "Nom", required: true },
      { key: "slug", label: "Slug" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "status", label: "Statut", kind: "select", options: ["active", "paused", "archived"] },
      { key: "sortOrder", label: "Ordre" },
    ],
  },
  pipelineStages: {
    endpoint: "pipeline-stages",
    title: "Étapes du pipeline sponsors",
    description: "Configurer les étapes de qualification, validation, approbation et clôture du sponsoring.",
    columns: ["name", "slug", "stageGroup", "status", "isTerminal", "sortOrder"],
    fields: [
      { key: "name", label: "Nom", required: true },
      { key: "slug", label: "Slug" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "stageGroup", label: "Groupe", kind: "select", options: ["active", "won", "lost", "no_contact"] },
      { key: "status", label: "Statut", kind: "select", options: ["active", "paused", "archived"] },
      { key: "isTerminal", label: "Étape terminale", kind: "checkbox" },
      { key: "sortOrder", label: "Ordre" },
    ],
  },
  organizations: {
    endpoint: "organizations",
    title: "Organisations cibles",
    description: "Centraliser les entreprises et institutions à approcher, avec priorité, catégorie, prochaine action et note de conformité.",
    columns: ["name", "sponsorCategory", "priority", "pipelineStageId", "nextAction", "doNotContact"],
    fields: [
      { key: "name", label: "Organisation", required: true },
      { key: "website", label: "Site web" },
      { key: "country", label: "Pays" },
      { key: "industry", label: "Secteur" },
      { key: "sponsorCategoryId", label: "ID catégorie sponsor" },
      { key: "sponsorCategory", label: "Catégorie libre" },
      { key: "companySize", label: "Taille" },
      { key: "priority", label: "Priorité", kind: "select", options: ["low", "medium", "high", "critical"] },
      { key: "pipelineStageId", label: "ID étape pipeline" },
      { key: "opportunityOwner", label: "ID responsable" },
      { key: "estimatedValue", label: "Valeur estimée" },
      { key: "currency", label: "Devise", kind: "select", options: ["XOF", "EUR", "USD"] },
      { key: "source", label: "Source" },
      { key: "nextAction", label: "Prochaine action" },
      { key: "nextActionDate", label: "Date prochaine action", kind: "date" },
      { key: "publicDescription", label: "Description publique", kind: "textarea" },
      { key: "strategicRelevance", label: "Pertinence stratégique", kind: "textarea" },
      { key: "internalNotes", label: "Notes internes", kind: "textarea" },
      { key: "publicNotes", label: "Notes publiques", kind: "textarea" },
      { key: "doNotContact", label: "Ne pas contacter", kind: "checkbox" },
    ],
  },
  contacts: {
    endpoint: "contacts",
    title: "Contacts CRM",
    description: "Gérer les contacts sponsors avec langue, source publique, score de confiance et option de suppression.",
    columns: ["email", "firstName", "lastName", "organizationId", "verificationStatus", "doNotContact"],
    fields: [
      { key: "organizationId", label: "ID organisation" },
      { key: "firstName", label: "Prénom" },
      { key: "lastName", label: "Nom" },
      { key: "jobTitle", label: "Fonction" },
      { key: "email", label: "Email", required: true },
      { key: "phone", label: "Téléphone" },
      { key: "country", label: "Pays" },
      { key: "preferredLanguage", label: "Langue", kind: "select", options: ["fr", "en"] },
      { key: "publicSourceUrl", label: "URL source publique" },
      { key: "verificationStatus", label: "Vérification", kind: "select", options: ["unverified", "verified", "bounced", "invalid"] },
      { key: "confidenceScore", label: "Score confiance" },
      { key: "relationshipOwner", label: "ID responsable relation" },
      { key: "lawfulContactNote", label: "Base de contact", kind: "textarea" },
      { key: "lastContactedAt", label: "Dernier contact", kind: "date" },
      { key: "lastRepliedAt", label: "Dernière réponse", kind: "date" },
      { key: "doNotContact", label: "Ne pas contacter", kind: "checkbox" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  opportunities: {
    endpoint: "opportunities",
    title: "Pipeline sponsors",
    description: "Suivre chaque opportunité par organisation, contact, catégorie, étape, prochaine action et statut.",
    columns: ["title", "organizationId", "contactId", "stageId", "priority", "status", "nextAction"],
    fields: [
      { key: "organizationId", label: "ID organisation", required: true },
      { key: "contactId", label: "ID contact" },
      { key: "sponsorCategoryId", label: "ID catégorie sponsor" },
      { key: "stageId", label: "ID étape" },
      { key: "title", label: "Titre opportunité", required: true },
      { key: "priority", label: "Priorité", kind: "select", options: ["low", "medium", "high", "critical"] },
      { key: "ownerUserId", label: "ID responsable" },
      { key: "estimatedValue", label: "Valeur estimée" },
      { key: "currency", label: "Devise", kind: "select", options: ["XOF", "EUR", "USD"] },
      { key: "source", label: "Source" },
      { key: "status", label: "Statut", kind: "select", options: ["active", "awaiting_approval", "approved", "won", "lost", "paused", "archived"] },
      { key: "nextAction", label: "Prochaine action" },
      { key: "nextActionDate", label: "Date prochaine action", kind: "date" },
      { key: "internalNotes", label: "Notes internes", kind: "textarea" },
      { key: "publicNotes", label: "Notes publiques", kind: "textarea" },
      { key: "doNotContact", label: "Ne pas contacter", kind: "checkbox" },
    ],
  },
  activities: {
    endpoint: "activities",
    title: "Activités CRM",
    description: "Journaliser les notes, appels, emails, suivis, réunions et résultats liés au pipeline sponsors.",
    columns: ["activityType", "channel", "subject", "organizationId", "opportunityId", "dueDate", "completedAt"],
    fields: [
      { key: "organizationId", label: "ID organisation" },
      { key: "contactId", label: "ID contact" },
      { key: "opportunityId", label: "ID opportunité" },
      { key: "actorUserId", label: "ID acteur" },
      { key: "activityType", label: "Type", kind: "select", options: ["note", "call", "email", "meeting", "follow_up", "approval", "system"] },
      { key: "channel", label: "Canal", kind: "select", options: ["admin", "email", "phone", "meeting", "public_form", "system"] },
      { key: "subject", label: "Sujet" },
      { key: "body", label: "Détail", kind: "textarea" },
      { key: "outcome", label: "Résultat" },
      { key: "dueDate", label: "Date limite", kind: "date" },
      { key: "completedAt", label: "Terminé le", kind: "date" },
    ],
  },
  emailTemplates: {
    endpoint: "email-templates",
    title: "Modèles email sponsors",
    description: "Rédiger les séquences sponsor en français, avec variables, version, signature et statut d'approbation.",
    columns: ["name", "templateGroup", "language", "status", "version", "approvedBy"],
    fields: [
      { key: "name", label: "Nom", required: true },
      { key: "templateGroup", label: "Groupe", kind: "select", options: ["Initial introduction", "Warm introduction", "Follow-up 1", "Follow-up 2", "Sponsor package", "Thank you", "Rejection / not a fit", "Meeting request"] },
      { key: "sponsorCategoryId", label: "ID catégorie sponsor" },
      { key: "language", label: "Langue", kind: "select", options: ["fr", "en"] },
      { key: "subject", label: "Sujet", required: true },
      { key: "body", label: "Corps", kind: "textarea", required: true },
      { key: "senderIdentityId", label: "ID expéditeur" },
      { key: "signature", label: "Signature", kind: "textarea" },
      { key: "status", label: "Statut", kind: "select", options: ["draft", "under_review", "approved", "archived"] },
      { key: "version", label: "Version" },
      { key: "approvedBy", label: "Approuvé par" },
      { key: "approvedAt", label: "Approuvé le", kind: "date" },
      { key: "variables", label: "Variables" },
      { key: "attachmentIds", label: "IDs pièces jointes" },
    ],
  },
  toolbox: {
    endpoint: "toolbox",
    title: "Sponsor Toolbox",
    description: "Inventorier les dossiers, decks, factsheets, communiqués et preuves utiles avant toute campagne.",
    columns: ["title", "category", "assetType", "status", "visibility", "version"],
    fields: [
      { key: "title", label: "Titre", required: true },
      { key: "category", label: "Catégorie", kind: "select", options: ["Core", "Corporate", "Mobility", "Technical", "Legal", "Media", "Follow-up"] },
      { key: "sponsorCategoryId", label: "ID catégorie sponsor" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "fileUrl", label: "URL fichier" },
      { key: "assetType", label: "Type", kind: "select", options: ["document", "deck", "image", "video", "link", "checklist"] },
      { key: "status", label: "Statut", kind: "select", options: ["needed", "draft", "under_review", "approved", "archived"] },
      { key: "version", label: "Version" },
      { key: "tags", label: "Tags" },
      { key: "approvedClaims", label: "Promesses autorisées" },
      { key: "prohibitedClaims", label: "Promesses interdites" },
      { key: "visibility", label: "Visibilité", kind: "select", options: ["admin_only", "team_only", "public"] },
    ],
  },
  suppression: {
    endpoint: "suppression",
    title: "Liste de suppression",
    description: "Bloquer les emails a ne jamais relancer et documenter la raison de retrait.",
    columns: ["email", "organizationId", "contactId", "reason", "status", "source"],
    fields: [
      { key: "email", label: "Email", required: true },
      { key: "organizationId", label: "ID organisation" },
      { key: "contactId", label: "ID contact" },
      { key: "reason", label: "Raison", kind: "select", options: ["manual", "unsubscribed", "bounced", "complaint", "not_relevant", "legal"] },
      { key: "source", label: "Source" },
      { key: "status", label: "Statut", kind: "select", options: ["active", "inactive", "archived"] },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  approvals: {
    endpoint: "approvals",
    title: "File d'approbation outreach",
    description: "Aucun email sponsor assiste ne doit partir sans revue humaine, statut explicite et journal d'audit.",
    columns: ["subject", "status", "opportunityId", "contactId", "templateId", "scheduledAt", "sentAt"],
    fields: [
      { key: "opportunityId", label: "ID opportunité" },
      { key: "contactId", label: "ID contact" },
      { key: "templateId", label: "ID modèle" },
      { key: "requesterUserId", label: "ID demandeur" },
      { key: "reviewerUserId", label: "ID validateur" },
      { key: "senderIdentityId", label: "ID expéditeur" },
      { key: "subject", label: "Sujet", required: true },
      { key: "body", label: "Corps", kind: "textarea", required: true },
      { key: "status", label: "Statut", kind: "select", options: ["awaiting_approval", "approved", "rejected", "scheduled", "sent", "cancelled"] },
      { key: "scheduledAt", label: "Programmé le", kind: "date" },
      { key: "decisionNotes", label: "Notes décision", kind: "textarea" },
    ],
  },
  inboxThreads: {
    endpoint: "inbox-threads",
    title: "Boîte de réception unifiée",
    description: "Regrouper les messages reçus via le site, les réponses email et les conversations sponsors sans exposer le contenu publiquement.",
    columns: ["subject", "status", "direction", "source", "organizationId", "opportunityId", "lastMessageAt"],
    fields: [
      { key: "providerThreadId", label: "Thread provider" },
      { key: "mailboxIdentityId", label: "ID boîte" },
      { key: "organizationId", label: "ID organisation" },
      { key: "contactId", label: "ID contact" },
      { key: "opportunityId", label: "ID opportunité" },
      { key: "assignedTo", label: "ID assigné" },
      { key: "direction", label: "Direction", kind: "select", options: ["inbound", "outbound", "mixed"] },
      { key: "subject", label: "Sujet", required: true },
      { key: "status", label: "Statut", kind: "select", options: ["open", "assigned", "waiting", "archived", "spam", "do_not_contact"] },
      { key: "source", label: "Source", kind: "select", options: ["manual", "public.contact", "public.sponsors", "imap", "smtp", "provider_webhook"] },
      { key: "lastMessageAt", label: "Dernier message", kind: "date" },
      { key: "tags", label: "Tags" },
      { key: "internalNotes", label: "Notes internes", kind: "textarea" },
    ],
  },
  mailMessages: {
    endpoint: "mail-messages",
    title: "Messages email",
    description: "Conserver les messages liés aux threads, avec entêtes de threading et statut de livraison.",
    columns: ["threadId", "fromEmail", "toEmails", "subject", "direction", "deliveryStatus", "receivedAt"],
    fields: [
      { key: "threadId", label: "ID thread", required: true },
      { key: "providerMessageId", label: "ID provider" },
      { key: "messageIdHeader", label: "Message-ID" },
      { key: "inReplyTo", label: "In-Reply-To" },
      { key: "referencesHeader", label: "References" },
      { key: "fromEmail", label: "De" },
      { key: "toEmails", label: "A" },
      { key: "ccEmails", label: "Cc" },
      { key: "subject", label: "Sujet", required: true },
      { key: "bodyText", label: "Corps", kind: "textarea" },
      { key: "direction", label: "Direction", kind: "select", options: ["inbound", "outbound"] },
      { key: "deliveryStatus", label: "Livraison", kind: "select", options: ["received", "draft", "queued", "sent", "bounced", "complaint", "failed"] },
      { key: "receivedAt", label: "Reçu le", kind: "date" },
      { key: "sentAt", label: "Envoyé le", kind: "date" },
    ],
  },
  sequences: {
    endpoint: "sequences",
    title: "Séquences outreach",
    description: "Configurer les suivis autorisés après approbation humaine, avec limites conservatrices et arrêt automatique sur réponse ou rebond.",
    columns: ["name", "status", "sponsorCategoryId", "maxSteps", "dailyLimit", "stopOnReply", "stopOnBounce"],
    fields: [
      { key: "name", label: "Nom", required: true },
      { key: "sponsorCategoryId", label: "ID categorie sponsor" },
      { key: "ownerUserId", label: "ID responsable" },
      { key: "status", label: "Statut", kind: "select", options: ["draft", "under_review", "approved", "active", "paused", "archived"] },
      { key: "templateIds", label: "IDs modèles" },
      { key: "maxSteps", label: "Étapes max" },
      { key: "minDelayHours", label: "Délai min heures" },
      { key: "dailyLimit", label: "Limite/jour" },
      { key: "businessHours", label: "Heures ouvrables" },
      { key: "stopOnReply", label: "Stop sur réponse", kind: "checkbox" },
      { key: "stopOnBounce", label: "Stop sur rebond", kind: "checkbox" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  imports: {
    endpoint: "imports",
    title: "Imports pipeline",
    description: "Tracer les imports CSV/XLSX avec mapping, doublons, avertissements et notes de rollback avant toute confirmation.",
    columns: ["fileName", "sourceType", "targetResource", "status", "rowCount", "importedCount", "duplicateCount"],
    fields: [
      { key: "fileName", label: "Nom fichier", required: true },
      { key: "sourceType", label: "Source", kind: "select", options: ["csv", "xlsx", "manual", "api"] },
      { key: "targetResource", label: "Cible", kind: "select", options: ["organizations", "contacts", "opportunities", "toolbox"] },
      { key: "status", label: "Statut", kind: "select", options: ["draft", "previewed", "validated", "confirmed", "importing", "completed", "failed", "rolled_back"] },
      { key: "rowCount", label: "Lignes" },
      { key: "importedCount", label: "Importées" },
      { key: "skippedCount", label: "Ignorées" },
      { key: "duplicateCount", label: "Doublons" },
      { key: "rollbackNotes", label: "Notes rollback", kind: "textarea" },
      { key: "confirmedAt", label: "Confirmé le", kind: "date" },
      { key: "completedAt", label: "Terminé le", kind: "date" },
    ],
  },
  agentResearch: {
    endpoint: "agent-research",
    title: "Agent de recherche sponsors",
    description: "Enregistrer les recherches publiques, scores, sources et brouillons proposés sans autoriser l'envoi automatique non approuvé.",
    columns: ["researchStatus", "organizationId", "opportunityId", "sponsorCategoryGuess", "relevanceScore", "confidenceScore", "approvalId"],
    fields: [
      { key: "organizationId", label: "ID organisation" },
      { key: "contactId", label: "ID contact" },
      { key: "opportunityId", label: "ID opportunité" },
      { key: "requestedByUserId", label: "ID demandeur" },
      { key: "approvalId", label: "ID approbation" },
      { key: "researchStatus", label: "Statut", kind: "select", options: ["draft", "researching", "needs_verification", "ready_for_review", "approved", "rejected", "archived"] },
      { key: "sourceUrls", label: "URLs sources" },
      { key: "summary", label: "Synthèse", kind: "textarea" },
      { key: "sponsorCategoryGuess", label: "Catégorie proposée" },
      { key: "relevanceScore", label: "Score pertinence" },
      { key: "confidenceScore", label: "Score confiance" },
      { key: "recommendedTemplateId", label: "ID modèle recommandé" },
      { key: "recommendedToolboxAssetIds", label: "IDs assets recommandés" },
      { key: "draftSubject", label: "Sujet brouillon" },
      { key: "draftBody", label: "Brouillon", kind: "textarea" },
      { key: "guardrailNotes", label: "Notes garde-fous", kind: "textarea" },
    ],
  },
  jobs: {
    endpoint: "jobs",
    title: "Jobs système",
    description: "Rendre visibles les travaux de synchronisation, suivi, planification et classification sans lancer de processus caché.",
    columns: ["jobType", "status", "attemptCount", "scheduledAt", "startedAt", "completedAt", "relatedEntityType"],
    fields: [
      { key: "jobType", label: "Type job", kind: "select", options: ["mail_sync", "webhook_processing", "attachment_processing", "scheduled_send", "follow_up", "bounce_processing", "reply_classification", "pipeline_summary", "mailbox_health"] },
      { key: "status", label: "Statut", kind: "select", options: ["queued", "running", "completed", "failed", "dead_letter", "cancelled"] },
      { key: "attemptCount", label: "Tentatives" },
      { key: "scheduledAt", label: "Programmé le", kind: "date" },
      { key: "startedAt", label: "Démarré le", kind: "date" },
      { key: "completedAt", label: "Terminé le", kind: "date" },
      { key: "error", label: "Erreur", kind: "textarea" },
      { key: "relatedEntityType", label: "Entité liée" },
      { key: "relatedEntityId", label: "ID entité liée" },
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
    description: "Journal des actions admin AGOOJIYE.",
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
  slug: "Slug",
  stageGroup: "Groupe",
  isTerminal: "Terminal",
  sponsorCategoryId: "ID catégorie sponsor",
  sponsorCategory: "Catégorie sponsor",
  country: "Pays",
  industry: "Secteur",
  companySize: "Taille",
  publicDescription: "Description publique",
  strategicRelevance: "Pertinence stratégique",
  pipelineStageId: "ID étape pipeline",
  opportunityOwner: "ID responsable",
  estimatedValue: "Valeur estimée",
  currency: "Devise",
  nextAction: "Prochaine action",
  nextActionDate: "Date prochaine action",
  internalNotes: "Notes internes",
  publicNotes: "Notes publiques",
  doNotContact: "Ne pas contacter",
  organizationId: "ID organisation",
  firstName: "Prénom",
  lastName: "Nom",
  jobTitle: "Fonction",
  preferredLanguage: "Langue",
  publicSourceUrl: "Source publique",
  verificationStatus: "Vérification",
  confidenceScore: "Score confiance",
  relationshipOwner: "ID relation",
  lawfulContactNote: "Base de contact",
  lastContactedAt: "Dernier contact",
  lastRepliedAt: "Dernière réponse",
  contactId: "ID contact",
  stageId: "ID étape",
  ownerUserId: "ID responsable",
  opportunityId: "ID opportunité",
  actorUserId: "ID acteur",
  activityType: "Type activité",
  channel: "Canal",
  outcome: "Résultat",
  completedAt: "Terminé le",
  templateGroup: "Groupe modèle",
  language: "Langue",
  senderIdentityId: "ID expéditeur",
  signature: "Signature",
  approvedBy: "Approuvé par",
  approvedAt: "Approuvé le",
  variables: "Variables",
  attachmentIds: "IDs pièces jointes",
  assetType: "Type asset",
  approvedClaims: "Promesses autorisées",
  prohibitedClaims: "Promesses interdites",
  reason: "Raison",
  templateId: "ID modèle",
  requesterUserId: "ID demandeur",
  reviewerUserId: "ID validateur",
  scheduledAt: "Programmé le",
  rejectedAt: "Rejeté le",
  sentAt: "Envoyé le",
  decisionNotes: "Notes décision",
  providerThreadId: "Thread provider",
  mailboxIdentityId: "ID boîte",
  direction: "Direction",
  lastMessageAt: "Dernier message",
  tags: "Tags",
  threadId: "ID thread",
  providerMessageId: "ID provider",
  messageIdHeader: "Message-ID",
  inReplyTo: "In-Reply-To",
  referencesHeader: "References",
  toEmails: "A",
  ccEmails: "Cc",
  bodyText: "Corps",
  bodyPreview: "Aperçu",
  deliveryStatus: "Livraison",
  receivedAt: "Reçu le",
  templateIds: "IDs modèles",
  maxSteps: "Étapes max",
  minDelayHours: "Délai min heures",
  dailyLimit: "Limite/jour",
  businessHours: "Heures ouvrables",
  stopOnReply: "Stop réponse",
  stopOnBounce: "Stop rebond",
  fileName: "Nom fichier",
  sourceType: "Source import",
  targetResource: "Cible",
  rowCount: "Lignes",
  importedCount: "Importées",
  skippedCount: "Ignorées",
  duplicateCount: "Doublons",
  rollbackNotes: "Notes rollback",
  confirmedAt: "Confirmé le",
  requestedByUserId: "ID demandeur",
  approvalId: "ID approbation",
  researchStatus: "Statut recherche",
  sourceUrls: "URLs sources",
  summary: "Synthèse",
  sponsorCategoryGuess: "Catégorie proposée",
  relevanceScore: "Score pertinence",
  recommendedTemplateId: "ID modèle recommandé",
  recommendedToolboxAssetIds: "IDs assets recommandés",
  draftSubject: "Sujet brouillon",
  draftBody: "Brouillon",
  guardrailNotes: "Notes garde-fous",
  jobType: "Type job",
  attemptCount: "Tentatives",
  startedAt: "Démarré le",
  error: "Erreur",
  relatedEntityType: "Entité liée",
  relatedEntityId: "ID entité liée",
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
  won: "gagne",
  lost: "perdu",
  no_contact: "sans contact",
  verified: "vérifié",
  unverified: "non vérifié",
  bounced: "rebond",
  invalid: "invalide",
  follow_up: "relance",
  call: "appel",
  meeting: "reunion",
  public_form: "formulaire public",
  awaiting_approval: "en validation",
  scheduled: "programme",
  sent: "envoye",
  cancelled: "annule",
  inactive: "inactif",
  unsubscribed: "desinscrit",
  complaint: "plainte",
  not_relevant: "non pertinent",
  legal: "legal",
  needed: "a produire",
  deck: "deck",
  link: "lien",
  checklist: "checklist",
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C99A36]">AGOOJIYE Operating Platform</p>
          <h1 className="mt-2 text-2xl font-semibold">Siège numérique du projet</h1>
          <p className="mt-1 text-sm text-[#B8AE9D]">Tenant distinct: AGOOJIYE Electric Mobility / agoojye / langue par défaut: français.</p>
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
              "Créer les comptes email officiels depuis la page Emails après confirmation.",
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
          <h2 className="font-semibold">Provisioning email officiel</h2>
          <ol className="mt-3 space-y-2 text-sm text-[#D8CFBF]">
            <li>1. Vérifier que le participant a un rôle confirmé.</li>
            <li>2. Créer la boîte depuis Emails avec le domaine agoojiye.com.</li>
            <li>3. Copier le mot de passe temporaire au moment de la création.</li>
            <li>4. Demander au membre de le changer sur /mail/password.</li>
            <li>5. Vérifier les alias partagés et le statut DNS.</li>
          </ol>
        </section>
      </div>
    </AdminShell>
  );
}

const sponsorCrmMetricLabels: Record<string, string> = {
  sponsorCategories: "Catégories sponsors",
  pipelineStages: "Étapes pipeline",
  crmOrganizations: "Organisations CRM",
  crmContacts: "Contacts CRM",
  sponsorOpportunities: "Opportunités sponsors",
  crmActivities: "Activités CRM",
  emailTemplates: "Modèles email",
  toolboxAssets: "Sponsor toolbox",
  suppressionEntries: "Suppressions",
  outreachApprovals: "Approbations",
  mailThreads: "Threads inbox",
  mailMessages: "Messages email",
  outreachSequences: "Séquences",
  importBatches: "Imports",
  agentResearchRecords: "Recherches agent",
  backgroundJobs: "Jobs système",
};

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
  return labels[key] || sponsorCrmMetricLabels[key] || key;
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
    if (section === "organizations") {
      return [
        { label: item.doNotContact ? "Contact OK" : "Ne pas contacter", patch: { doNotContact: !item.doNotContact } },
        { label: "Haute priorite", patch: { priority: "high" } },
      ];
    }
    if (section === "contacts") {
      return [
        { label: item.doNotContact ? "Contact OK" : "Ne pas contacter", patch: { doNotContact: !item.doNotContact } },
        { label: "Vérifier", patch: { verificationStatus: "verified" } },
      ];
    }
    if (section === "opportunities") {
      return [
        { label: "En validation", patch: { status: "awaiting_approval" } },
        { label: "Gagne", patch: { status: "won" } },
        { label: "Perdu", patch: { status: "lost" } },
      ];
    }
    if (section === "emailTemplates" || section === "toolbox") {
      return [
        { label: "Revue", patch: { status: "under_review" } },
        { label: "Approuver", patch: { status: "approved" } },
      ];
    }
    if (section === "approvals") {
      return [
        { label: "Approuver", patch: { status: "approved", approvedAt: new Date().toISOString() } },
        { label: "Rejeter", patch: { status: "rejected", rejectedAt: new Date().toISOString() } },
        { label: "Envoyé", patch: { status: "sent", sentAt: new Date().toISOString() } },
      ];
    }
    if (section === "suppression") {
      return [
        { label: "Actif", patch: { status: "active" } },
        { label: "Inactif", patch: { status: "inactive" } },
      ];
    }
    if (section === "inboxThreads") {
      return [
        { label: "Assigner", patch: { status: "assigned" } },
        { label: "Archiver", patch: { status: "archived" } },
        { label: "DNC", patch: { status: "do_not_contact" } },
      ];
    }
    if (section === "mailMessages") {
      return [
        { label: "Reçu", patch: { deliveryStatus: "received" } },
        { label: "Envoyé", patch: { deliveryStatus: "sent", sentAt: new Date().toISOString() } },
        { label: "Rebond", patch: { deliveryStatus: "bounced" } },
      ];
    }
    if (section === "sequences") {
      return [
        { label: "Revue", patch: { status: "under_review" } },
        { label: "Activer", patch: { status: "active" } },
        { label: "Pause", patch: { status: "paused" } },
      ];
    }
    if (section === "imports") {
      return [
        { label: "Valider", patch: { status: "validated" } },
        { label: "Confirmer", patch: { status: "confirmed", confirmedAt: new Date().toISOString() } },
        { label: "Terminer", patch: { status: "completed", completedAt: new Date().toISOString() } },
      ];
    }
    if (section === "agentResearch") {
      return [
        { label: "Vérifier", patch: { researchStatus: "needs_verification" } },
        { label: "Revue", patch: { researchStatus: "ready_for_review" } },
        { label: "Approuver", patch: { researchStatus: "approved" } },
      ];
    }
    if (section === "jobs") {
      return [
        { label: "Démarrer", patch: { status: "running", startedAt: new Date().toISOString() } },
        { label: "Terminer", patch: { status: "completed", completedAt: new Date().toISOString() } },
        { label: "Échec", patch: { status: "failed" } },
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
  return (
    <AdminShell section="emails">
      <section className="rounded-md border border-white/15 bg-white/5 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Emails officiels AGOOJIYE</h2>
            <p className="mt-1 max-w-4xl text-sm text-[#B8AE9D]">
              Créer les boîtes professionnelles, réinitialiser les mots de passe temporaires, contrôler les alias
              partagés et suivre le statut DNS du domaine. Les mots de passe ne sont affichés qu'une seule fois pour
              remise au membre, puis le changement se fait sur /mail/password.
            </p>
          </div>
          <a href="/mail/password" className="rounded border border-[#C99A36]/35 px-3 py-2 text-xs font-semibold text-[#E4C46A] hover:bg-[#C99A36]/10">
            Page changement mot de passe
          </a>
        </div>
      </section>
      <div className="mt-4">
        <AdminHumanEmailAccountsPanel />
      </div>
    </AdminShell>
  );
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

export function AgoojyeAdminSponsorCategoriesPage() {
  return <ResourcePage section="sponsorCategories" />;
}

export function AgoojyeAdminPipelineStagesPage() {
  return <ResourcePage section="pipelineStages" />;
}

export function AgoojyeAdminOrganizationsPage() {
  return <ResourcePage section="organizations" />;
}

export function AgoojyeAdminContactsPage() {
  return <ResourcePage section="contacts" />;
}

export function AgoojyeAdminOpportunitiesPage() {
  return <ResourcePage section="opportunities" />;
}

export function AgoojyeAdminActivitiesPage() {
  return <ResourcePage section="activities" />;
}

export function AgoojyeAdminEmailTemplatesPage() {
  return <ResourcePage section="emailTemplates" />;
}

export function AgoojyeAdminToolboxPage() {
  return <ResourcePage section="toolbox" />;
}

export function AgoojyeAdminSuppressionPage() {
  return <ResourcePage section="suppression" />;
}

export function AgoojyeAdminApprovalsPage() {
  return <ResourcePage section="approvals" />;
}

export function AgoojyeAdminInboxThreadsPage() {
  const queryClient = useQueryClient();
  const syncMutation = useMutation({
    mutationFn: () => apiRequest("/api/admin/agoojye/mail/sync", "POST", {}),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  return (
    <AdminShell section="inboxThreads">
      <section className="flex flex-col gap-3 rounded-md border border-white/15 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Boîte unifiée AGOOJIYE</h2>
          <p className="mt-1 text-sm text-[#B8AE9D]">
            Messages de Regis, Marise, Vital, Surian et Binta, avec réponses et suivi des contacts.
          </p>
        </div>
        <button
          type="button"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-[#C99A36] px-4 py-2 text-sm font-semibold text-[#080808] disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Synchronisation..." : "Synchroniser les boîtes"}
        </button>
        {syncMutation.isError ? (
          <p className="text-sm text-red-300">{String((syncMutation.error as Error)?.message || "Synchronisation impossible.")}</p>
        ) : null}
      </section>
      <div className="mt-4 overflow-hidden rounded-md border border-white/15 bg-[#0B0F16]">
        <AdminEmailControlCenterPage />
      </div>
    </AdminShell>
  );
}

export function AgoojyeAdminMailMessagesPage() {
  return <ResourcePage section="mailMessages" />;
}

export function AgoojyeAdminSequencesPage() {
  return <ResourcePage section="sequences" />;
}

export function AgoojyeAdminImportsPage() {
  return <ResourcePage section="imports" />;
}

export function AgoojyeAdminAgentResearchPage() {
  return <ResourcePage section="agentResearch" />;
}

export function AgoojyeAdminJobsPage() {
  return <ResourcePage section="jobs" />;
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
