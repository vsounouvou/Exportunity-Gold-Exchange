export type TalkExecutionLanguage = "en" | "fr" | "auto";

export type TalkExecutionStateInput = {
  language?: TalkExecutionLanguage;
  missingFields?: string[];
  crm?: {
    status?: string | null;
    stage?: string | null;
    opportunityReferenceCode?: string | null;
  } | null;
  sourcingTask?: {
    status?: string | null;
    publicTaskId?: string | null;
    state?: string | null;
    requiresHumanApproval?: boolean;
    outboundActionsAllowed?: boolean;
  } | null;
  supplierCandidateScreening?: {
    status?: string | null;
    candidateCount?: number;
    requiresHumanApproval?: boolean;
    supplierIdentityPublic?: boolean;
    outboundActionsAllowed?: boolean;
    externalDiscoveryStarted?: boolean;
    quoteCreated?: boolean;
  } | null;
  retrieval?: {
    status?: string | null;
    verifiedMatchCount?: number;
    publicMatchCount?: number;
  } | null;
};

export type TalkExecutionState = {
  locale: "en" | "fr";
  internalSupply: string | null;
  opportunity: string | null;
  sourcingReview: string | null;
  supplierScreening: string | null;
  outbound: string | null;
  quote: string | null;
  nextStep: string;
};

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

export function deriveTalkExecutionState(
  input: TalkExecutionStateInput,
): TalkExecutionState | null {
  const locale = input.language === "fr" ? "fr" : "en";
  const fr = locale === "fr";
  const missingFields = Array.isArray(input.missingFields)
    ? input.missingFields.map(clean).filter(Boolean)
    : [];
  const crmStatus = clean(input.crm?.status);
  const crmStage = clean(input.crm?.stage);
  const opportunityReference = clean(input.crm?.opportunityReferenceCode);
  const taskStatus = clean(input.sourcingTask?.status);
  const taskReference = clean(input.sourcingTask?.publicTaskId);
  const taskState = clean(input.sourcingTask?.state);
  const screeningStatus = clean(input.supplierCandidateScreening?.status);
  const retrievalStatus = clean(input.retrieval?.status);

  if (
    !missingFields.length &&
    !crmStatus &&
    !taskStatus &&
    !screeningStatus &&
    !retrievalStatus
  ) {
    return null;
  }

  const verifiedMatches = count(input.retrieval?.verifiedMatchCount);
  const publicMatches = count(input.retrieval?.publicMatchCount);
  let internalSupply: string | null = null;
  if (retrievalStatus === "verified_matches") {
    internalSupply = fr
      ? `${publicMatches} option${publicMatches > 1 ? "s" : ""} de catalogue vérifiée${publicMatches > 1 ? "s" : ""}; disponibilité et conditions non confirmées`
      : `${publicMatches} verified catalog option${publicMatches === 1 ? "" : "s"}; availability and terms unconfirmed`;
  } else if (retrievalStatus === "internal_matches_require_review") {
    internalSupply = fr
      ? `${verifiedMatches} correspondance${verifiedMatches > 1 ? "s" : ""} interne${verifiedMatches > 1 ? "s" : ""}; détails réservés à la revue`
      : `${verifiedMatches} internal match${verifiedMatches === 1 ? "" : "es"}; details held for review`;
  } else if (retrievalStatus === "no_verified_match") {
    internalSupply = fr
      ? "Aucune offre catalogue vérifiée ne correspond exactement"
      : "No exact verified catalog offer";
  } else if (retrievalStatus === "clarification_required") {
    internalSupply = fr
      ? "En attente des détails essentiels de la demande"
      : "Waiting for essential requirement details";
  }

  let opportunity: string | null = null;
  if (opportunityReference) {
    opportunity = fr
      ? `${opportunityReference}${crmStage ? ` • étape ${crmStage}` : ""}`
      : `${opportunityReference}${crmStage ? ` • stage ${crmStage}` : ""}`;
  } else if (crmStatus === "lead_captured") {
    opportunity = fr
      ? "Lead enregistré; l’opportunité attend le contact et la qualification"
      : "Lead captured; opportunity waits for contact and qualification";
  } else if (crmStatus === "operator_company_missing") {
    opportunity = fr
      ? "Configuration de la société opératrice manquante"
      : "Operator company configuration missing";
  } else if (crmStatus === "sync_deferred") {
    opportunity = fr
      ? "Synchronisation CRM différée"
      : "CRM synchronization deferred";
  }

  let sourcingReview: string | null = null;
  if (taskStatus === "review_task_ready") {
    sourcingReview = fr
      ? `${taskReference || "Tâche de sourcing"}${taskState ? ` • ${taskState}` : ""} • approbation humaine requise`
      : `${taskReference || "Sourcing task"}${taskState ? ` • ${taskState}` : ""} • human approval required`;
  } else if (taskStatus === "agent_assignment_missing") {
    sourcingReview = fr
      ? "Affectation des agents Commercial et Sourcing manquante"
      : "Commercial and Sourcing agent assignment missing";
  } else if (taskStatus === "sync_deferred") {
    sourcingReview = fr
      ? "Synchronisation de la tâche de sourcing différée"
      : "Sourcing task synchronization deferred";
  } else if (taskStatus === "not_eligible") {
    sourcingReview = fr
      ? "La demande n’est pas encore admissible à la revue sourcing"
      : "Request is not yet eligible for sourcing review";
  }

  const candidateCount = count(
    input.supplierCandidateScreening?.candidateCount,
  );
  let supplierScreening: string | null = null;
  if (screeningStatus === "candidates_ready") {
    supplierScreening = fr
      ? `${candidateCount} candidat${candidateCount > 1 ? "s" : ""} fournisseur${candidateCount > 1 ? "s" : ""} interne${candidateCount > 1 ? "s" : ""} vérifié${candidateCount > 1 ? "s" : ""} enregistré${candidateCount > 1 ? "s" : ""} pour revue`
      : `${candidateCount} verified internal supplier candidate${candidateCount === 1 ? "" : "s"} recorded for review`;
  } else if (screeningStatus === "no_verified_candidate") {
    supplierScreening = fr
      ? "Aucun fournisseur interne vérifié n’atteint le seuil de pertinence"
      : "No verified internal supplier meets the relevance threshold";
  } else if (screeningStatus === "requirement_not_found") {
    supplierScreening = fr
      ? "La demande liée est introuvable pour le contrôle fournisseur"
      : "Linked requirement was not found for supplier screening";
  } else if (screeningStatus === "sync_deferred") {
    supplierScreening = fr
      ? "Contrôle des fournisseurs différé"
      : "Supplier screening deferred";
  }

  const outboundKnownNotStarted =
    input.sourcingTask?.outboundActionsAllowed === false ||
    input.supplierCandidateScreening?.outboundActionsAllowed === false;
  const outbound = outboundKnownNotStarted
    ? fr
      ? "Non démarré"
      : "Not started"
    : null;
  const quote = input.supplierCandidateScreening?.quoteCreated === false
    ? fr
      ? "Non créé"
      : "Not created"
    : null;

  let nextStep: string;
  if (missingFields.length) {
    nextStep = fr
      ? `Compléter : ${missingFields.join(", ")}`
      : `Provide: ${missingFields.join(", ")}`;
  } else if (crmStatus === "operator_company_missing") {
    nextStep = fr
      ? "Un administrateur doit corriger la société opératrice Exportunity"
      : "An administrator must repair the Exportunity operator company";
  } else if (crmStatus === "sync_deferred" || taskStatus === "sync_deferred") {
    nextStep = fr
      ? "Un opérateur doit examiner l’échec de synchronisation"
      : "An operator must review the synchronization failure";
  } else if (taskStatus === "agent_assignment_missing") {
    nextStep = fr
      ? "Un administrateur doit affecter les agents Commercial et Sourcing"
      : "An administrator must assign the Commercial and Sourcing agents";
  } else if (crmStatus === "lead_captured" && !opportunityReference) {
    nextStep = fr
      ? "Fournir un WhatsApp ou un email pour ouvrir l’opportunité qualifiée"
      : "Provide WhatsApp or email to open the qualified opportunity";
  } else if (screeningStatus === "candidates_ready") {
    nextStep = fr
      ? "Un responsable commercial doit examiner les candidats avant tout contact"
      : "A commercial manager must review candidates before any contact";
  } else if (screeningStatus === "no_verified_candidate") {
    nextStep = fr
      ? "Une approbation humaine est requise avant toute recherche fournisseur externe"
      : "Human approval is required before external supplier discovery";
  } else if (taskStatus === "review_task_ready") {
    nextStep = fr
      ? "Un responsable commercial doit approuver la prochaine action externe"
      : "A commercial manager must approve the next external action";
  } else if (retrievalStatus === "verified_matches") {
    nextStep = fr
      ? "Confirmer la disponibilité et les conditions commerciales"
      : "Confirm availability and commercial terms";
  } else {
    nextStep = fr
      ? "La revue commerciale reste à effectuer"
      : "Commercial review remains pending";
  }

  return {
    locale,
    internalSupply,
    opportunity,
    sourcingReview,
    supplierScreening,
    outbound,
    quote,
    nextStep,
  };
}
