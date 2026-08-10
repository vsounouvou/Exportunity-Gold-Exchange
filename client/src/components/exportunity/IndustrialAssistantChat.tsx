import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  CheckCircle2,
  PackageSearch,
  Paperclip,
  Send,
  Trash2,
  X,
} from "lucide-react";

import { VoiceToTextButton } from "@/components/chat/VoiceToTextButton";
import { cn } from "@/lib/utils";

type Language = "fr" | "en";

export type IndustrialAssistantContext = {
  id: string;
  title: string;
  intro: string;
  role?: string;
  quickReplies?: string[];
};

export type IndustrialAssistantProductContext = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  factoryId?: string | null;
  factoryName?: string | null;
  factoryLocation?: string | null;
  categoryCode: string;
  classification: string;
  requirementType: string;
  unitOfMeasure?: string | null;
  minimumOrderQuantity?: string | null;
  leadTimeText?: string | null;
  reference?: string | null;
};

type AssistantMessage = {
  id: string;
  sender: "assistant" | "user";
  text: string;
};

type IntakePreview = {
  requirementType: string;
  categoryCode: string;
  title: string;
  urgency: "standard" | "urgent" | "planned";
};

type ConversationStep =
  | "need"
  | "quantity"
  | "destination"
  | "timing"
  | "priority"
  | "name"
  | "email"
  | "company"
  | "confirm"
  | "complete";

type AttachmentSession = {
  requirementId: string;
  token: string;
  expiresAt: string;
  referenceCode: string;
  maxFiles: number;
};

const ACCEPTED_ATTACHMENTS =
  ".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx,.dxf,.dwg,.step,.stp,.stl,.iges,.igs";
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

async function uploadAttachments(session: AttachmentSession, files: File[]) {
  let uploaded = 0;
  for (const file of files) {
    const body = new FormData();
    body.append("file", file, file.name);
    const response = await fetch(
      `/api/industrial/requirements/${encodeURIComponent(session.requirementId)}/attachments`,
      {
        method: "POST",
        headers: { "x-industrial-upload-token": session.token },
        body,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.message || "The technical document could not be uploaded.",
      );
    }
    uploaded += 1;
  }
  return uploaded;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizedAnswer(value: string) {
  return value.trim().toLocaleLowerCase("fr");
}

function isSkipAnswer(value: string) {
  const answer = normalizedAnswer(value);
  return ["passer", "skip", "aucune", "none", "non", "no"].includes(answer);
}

function isConfirmationAnswer(value: string) {
  const answer = normalizedAnswer(value);
  return (
    answer.includes("confirmer") ||
    answer.includes("confirm") ||
    answer === "oui" ||
    answer === "yes" ||
    answer === "ok"
  );
}

function wantsQuantityChange(value: string) {
  const answer = normalizedAnswer(value);
  return answer.includes("quantite") || answer.includes("quantity");
}

function wantsDestinationChange(value: string) {
  const answer = normalizedAnswer(value);
  return answer.includes("destination") || answer.includes("livraison");
}

function inferCountryCode(destination: string) {
  const value = normalizedAnswer(destination);
  if (value.includes("benin") || value.includes("cotonou")) return "BJ";
  if (
    value.includes("ivoire") ||
    value.includes("abidjan") ||
    value.includes("cocody")
  )
    return "CI";
  if (value.includes("togo") || value.includes("lome")) return "TG";
  if (value.includes("ghana") || value.includes("accra")) return "GH";
  if (value.includes("nigeria") || value.includes("lagos")) return "NG";
  return null;
}

function inferUrgency(value: string): IntakePreview["urgency"] {
  const answer = normalizedAnswer(value);
  if (
    answer.includes("urgent") ||
    answer.includes("asap") ||
    answer.includes("immediat") ||
    answer.includes("aujourd")
  )
    return "urgent";
  if (
    answer.includes("plan") ||
    answer.includes("mois") ||
    answer.includes("month")
  )
    return "planned";
  return "standard";
}

export function IndustrialAssistantChat({
  language,
  requester,
  context,
  product,
  mode = "concierge",
  onCloseProduct,
  className,
}: {
  language: Language;
  requester?: { displayName?: string | null; email?: string | null } | null;
  context?: IndustrialAssistantContext | null;
  product?: IndustrialAssistantProductContext | null;
  mode?: "concierge" | "commercial";
  onCloseProduct?: (() => void) | null;
  className?: string;
}) {
  const copy =
    language === "fr"
      ? {
          name: "Tassi",
          role: "Exportunity AI | Sourcing et operations",
          productRole: "Commande industrielle accompagnee",
          conversation: "Conversation avec Tassi",
          ready: "Tassi est prete",
          composerLabel: "Envoyer un message a Tassi",
          greeting:
            "Bonjour, je suis Tassi. Dites-moi ce que vous devez sourcer, fabriquer ou acheminer.",
          productGreeting: (name: string, factory: string) =>
            `Bonjour, je suis Awa, votre interlocutrice commerciale Exportunity. Vous consultez ${name}${factory ? `, propose par ${factory}` : ""}. Je vais preparer la commande avec vous, une question a la fois. Quelle quantite souhaitez-vous ?`,
          placeholder: "Ecrivez votre reponse a Tassi...",
          completePlaceholder: "Votre dossier est enregistre",
          attach: "Joindre une photo ou un fichier",
          send: "Envoyer a Tassi",
          preparing: "Tassi organise votre demande...",
          creating: "Tassi enregistre votre dossier...",
          attachmentError: "Chaque fichier doit faire 15 Mo ou moins.",
          emptyMessage:
            "Ajoutez plus de details sur la piece, la machine, la quantite ou le probleme a resoudre.",
          evidenceSaved:
            "fichier technique joint comme element de preuve prive pour la revue interne",
          evidenceSavedPlural:
            "fichiers techniques joints comme elements de preuve prives pour la revue interne",
          submissionError:
            "Le dossier n'a pas pu etre enregistre. Verifiez les informations puis reessayez.",
          quantityQuestion:
            "Quelle quantite ou quel volume souhaitez-vous commander ?",
          destinationQuestion:
            "Ou faut-il livrer la commande ? Indiquez la ville, le pays ou le port.",
          timingQuestion: "Pour quand avez-vous besoin de cette commande ?",
          priorityQuestion:
            "Qu'est-ce qui compte le plus pour cette commande ?",
          priorityReplies: [
            "Livraison la plus rapide",
            "Meilleur cout total",
            "Qualite et certifications",
            "Fournisseur local verifie",
          ],
          nameQuestion:
            "Quel nom dois-je inscrire comme contact pour ce dossier ?",
          invalidName:
            "J'ai besoin d'un nom de contact d'au moins deux caracteres.",
          emailQuestion:
            "Quelle adresse email professionnelle doit recevoir le suivi ?",
          invalidEmail:
            "Cette adresse email ne semble pas complete. Pouvez-vous la verifier ?",
          companyQuestion:
            "Quelle entreprise representez-vous ? Vous pouvez repondre Passer.",
          confirmationQuestion:
            "J'ai rassemble les informations. Confirmez la demande ou dites-moi ce qu'il faut modifier.",
          noteAdded:
            "J'ajoute cette precision au dossier. Confirmez lorsque le recapitulatif vous convient.",
          summary: "Votre demande",
          quantity: "Quantite",
          destination: "Livraison",
          timing: "Delai souhaite",
          priority: "Priorite",
          contact: "Contact",
          company: "Entreprise",
          producer: "Producteur",
          minimum: "Minimum",
          leadTime: "Delai indicatif",
          close: "Fermer la conversation produit",
          firstReplies: [
            "Je cherche une piece detachee urgente",
            "Je dois sourcer une machine",
            "Je cherche une matiere premiere",
            "Je veux refaire une piece localement",
            "J'ai besoin de logistique ou import",
          ],
          destinationReplies: [
            "Cotonou, Benin",
            "Port de Cotonou",
            "Abidjan, Cote d'Ivoire",
            "A retirer sur place",
          ],
          timingReplies: [
            "Des que possible",
            "Sous 2 semaines",
            "Sous 30 jours",
            "Date a preciser",
          ],
          skip: "Passer",
          confirm: "Confirmer la demande",
          changeQuantity: "Modifier la quantite",
          changeDestination: "Modifier la destination",
        }
      : {
          name: "Tassi",
          role: "Exportunity AI | Sourcing and operations",
          productRole: "Assisted industrial order",
          conversation: "Conversation with Tassi",
          ready: "Tassi is ready",
          composerLabel: "Message Tassi",
          greeting:
            "Hello, I am Tassi. Tell me what you need to source, manufacture, or move.",
          productGreeting: (name: string, factory: string) =>
            `Hello, I am Awa, your Exportunity commercial lead. You are viewing ${name}${factory ? `, offered by ${factory}` : ""}. I will prepare the order with you, one question at a time. What quantity do you need?`,
          placeholder: "Type your answer to Tassi...",
          completePlaceholder: "Your case has been recorded",
          attach: "Attach a photo or file",
          send: "Send to Tassi",
          preparing: "Tassi is organizing your request...",
          creating: "Tassi is recording your case...",
          attachmentError: "Each file must be 15 MB or smaller.",
          emptyMessage:
            "Add more detail about the part, machine, quantity, or issue to solve.",
          evidenceSaved:
            "technical file attached as private evidence for internal review",
          evidenceSavedPlural:
            "technical files attached as private evidence for internal review",
          submissionError:
            "The case could not be saved. Check the information and try again.",
          quantityQuestion: "What quantity or volume would you like to order?",
          destinationQuestion:
            "Where should the order be delivered? Enter a city, country, or port.",
          timingQuestion: "When do you need this order?",
          priorityQuestion: "What matters most for this order?",
          priorityReplies: [
            "Fastest delivery",
            "Best total cost",
            "Quality and certifications",
            "Verified local supplier",
          ],
          nameQuestion: "What contact name should I put on this case?",
          invalidName: "I need a contact name with at least two characters.",
          emailQuestion:
            "Which work email address should receive the follow-up?",
          invalidEmail:
            "That email address does not look complete. Could you check it?",
          companyQuestion:
            "Which company do you represent? You can answer Skip.",
          confirmationQuestion:
            "I have gathered the information. Confirm the request or tell me what to change.",
          noteAdded:
            "I added that detail to the case. Confirm when the summary looks right.",
          summary: "Your request",
          quantity: "Quantity",
          destination: "Delivery",
          timing: "Needed by",
          priority: "Priority",
          contact: "Contact",
          company: "Company",
          producer: "Producer",
          minimum: "Minimum",
          leadTime: "Indicative lead time",
          close: "Close product conversation",
          firstReplies: [
            "I need an urgent spare part",
            "I need to source a production machine",
            "I need a raw material",
            "I need to reproduce a part locally",
            "I need logistics or import support",
          ],
          destinationReplies: [
            "Cotonou, Benin",
            "Port of Cotonou",
            "Abidjan, Cote d'Ivoire",
            "Collect from the factory",
          ],
          timingReplies: [
            "As soon as possible",
            "Within 2 weeks",
            "Within 30 days",
            "Date to be confirmed",
          ],
          skip: "Skip",
          confirm: "Confirm request",
          changeQuantity: "Change quantity",
          changeDestination: "Change destination",
        };

  const commercialMode = mode === "commercial" || Boolean(product);
  const activeGreeting = context?.intro || copy.greeting;
  const productGreeting = product
    ? copy.productGreeting(product.name, product.factoryName || "")
    : activeGreeting;
  const visibleAgentName = commercialMode ? "Awa Kouadio" : copy.name;
  const visibleAgentRole = commercialMode
    ? language === "fr"
      ? "Directrice commerciale | Relation client"
      : "Commercial Director | Client relationships"
    : context?.role || copy.role;
  const activeConversationLabel =
    language === "fr"
      ? `Conversation avec ${visibleAgentName}`
      : `Conversation with ${visibleAgentName}`;
  const activeComposerLabel =
    language === "fr"
      ? `Envoyer un message a ${visibleAgentName}`
      : `Message ${visibleAgentName}`;
  const activeSendLabel =
    language === "fr"
      ? `Envoyer a ${visibleAgentName}`
      : `Send to ${visibleAgentName}`;
  const activePreparingLabel = commercialMode
    ? language === "fr"
      ? "Awa qualifie votre demande..."
      : "Awa is qualifying your request..."
    : copy.preparing;
  const activeCreatingLabel = commercialMode
    ? language === "fr"
      ? "Awa enregistre votre dossier commercial..."
      : "Awa is recording your commercial case..."
    : copy.creating;
  const initialIntake: IntakePreview | null = product
    ? {
        requirementType: product.requirementType,
        categoryCode: product.categoryCode,
        title:
          language === "fr"
            ? `Commande de ${product.name}`
            : `Order for ${product.name}`,
        urgency: "standard",
      }
    : null;
  const initialStep: ConversationStep = product ? "quantity" : "need";
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    { id: "welcome", sender: "assistant", text: productGreeting },
  ]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [intake, setIntake] = useState<IntakePreview | null>(initialIntake);
  const [step, setStep] = useState<ConversationStep>(initialStep);
  const [initialNeed, setInitialNeed] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [destination, setDestination] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [purchasePriority, setPurchasePriority] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [requesterName, setRequesterName] = useState(
    requester?.displayName || "",
  );
  const [requesterEmail, setRequesterEmail] = useState(requester?.email || "");
  const [requesterCompany, setRequesterCompany] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [caseReference, setCaseReference] = useState<string | null>(null);
  const [caseAssignee, setCaseAssignee] = useState<string | null>(null);
  const [attachmentSession, setAttachmentSession] =
    useState<AttachmentSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const messageLogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([
      { id: "welcome", sender: "assistant", text: productGreeting },
    ]);
    setDraft("");
    setAttachments([]);
    setIntake(initialIntake);
    setStep(initialStep);
    setInitialNeed("");
    setQuantityText("");
    setDestination("");
    setRequiredBy("");
    setPurchasePriority("");
    setAdditionalNotes("");
    setRequesterCompany("");
    setCaseReference(null);
    setCaseAssignee(null);
    setAttachmentSession(null);
    setError(null);
  }, [activeGreeting, language, product?.id]);

  useEffect(() => {
    if (requester?.displayName) setRequesterName(requester.displayName);
    if (requester?.email) setRequesterEmail(requester.email);
  }, [requester?.displayName, requester?.email]);

  useEffect(() => {
    const log = messageLogRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [isCreating, isPreviewing, messages]);

  const appendAssistant = (text: string) => {
    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}-${current.length}`,
        sender: "assistant",
        text,
      },
    ]);
  };

  const appendUser = (text: string) => {
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}-${current.length}`, sender: "user", text },
    ]);
  };

  const ask = (nextStep: ConversationStep, question: string) => {
    setStep(nextStep);
    appendAssistant(question);
  };

  const continueToContact = () => {
    if (!requesterName.trim()) {
      ask("name", copy.nameQuestion);
      return;
    }
    if (!requesterEmail.trim()) {
      ask("email", copy.emailQuestion);
      return;
    }
    ask("company", copy.companyQuestion);
  };

  const requirementDetails = () =>
    [
      product ? `Product: ${product.name}` : initialNeed,
      product?.factoryName ? `Producer: ${product.factoryName}` : "",
      product?.reference ? `Reference: ${product.reference}` : "",
      quantityText ? `Quantity: ${quantityText}` : "",
      destination ? `Delivery: ${destination}` : "",
      requiredBy ? `Needed by: ${requiredBy}` : "",
      purchasePriority ? `Buyer priority: ${purchasePriority}` : "",
      additionalNotes ? `Additional details: ${additionalNotes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  const createCase = async () => {
    if (
      !intake ||
      isCreating ||
      !requesterName.trim() ||
      !requesterEmail.trim()
    )
      return;

    setError(null);
    setIsCreating(true);
    let createdReference: string | null = null;
    let activeAttachmentSession: AttachmentSession | null = null;
    try {
      const technicalDetails: Record<string, string> = {
        intakeSource: product
          ? "exportunity_ai_product_order"
          : commercialMode
            ? "exportunity_ai_commercial_intake"
            : "exportunity_ai_industrial_intake",
        initialMessage: initialNeed || product?.name || intake.title,
        attachmentCount: String(attachments.length),
        commercialOwner: commercialMode ? "Awa Kouadio" : "",
        salesMethod: commercialMode
          ? "consultative_discovery_summary_next_step"
          : "",
      };
      if (purchasePriority)
        technicalDetails.purchasePriority = purchasePriority;
      if (product?.id) technicalDetails.catalogItemId = product.id;
      if (product?.name) technicalDetails.productName = product.name;
      if (product?.factoryName)
        technicalDetails.producerName = product.factoryName;
      if (product?.unitOfMeasure)
        technicalDetails.unitOfMeasure = product.unitOfMeasure;
      if (product?.minimumOrderQuantity)
        technicalDetails.minimumOrderQuantity = product.minimumOrderQuantity;
      if (product?.reference)
        technicalDetails.productReference = product.reference;

      const response = await fetch("/api/industrial/requirements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requirementType: intake.requirementType,
          categoryCode: intake.categoryCode,
          title: intake.title,
          details: requirementDetails(),
          quantityText: quantityText || null,
          deliveryCountryCode: inferCountryCode(destination),
          deliveryCity: destination || null,
          requiredBy: requiredBy || null,
          urgency: inferUrgency(requiredBy || initialNeed),
          requesterCompany: requesterCompany.trim() || null,
          requesterName: requesterName.trim(),
          requesterEmail: requesterEmail.trim(),
          factoryId: product?.factoryId || null,
          technicalDetails,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload?.requirement?.id) {
        throw new Error(payload?.message || copy.submissionError);
      }

      const upload = payload.requirement.attachmentUpload;
      createdReference = String(payload.requirement.referenceCode || "");
      activeAttachmentSession =
        upload?.token && payload.requirement.id
          ? {
              requirementId: String(payload.requirement.id),
              token: String(upload.token),
              expiresAt: String(upload.expiresAt || ""),
              referenceCode: createdReference,
              maxFiles: Number(upload.maxFiles || 5),
            }
          : null;
      if (attachments.length && !activeAttachmentSession) {
        throw new Error(copy.submissionError);
      }
      const uploaded =
        attachments.length && activeAttachmentSession
          ? await uploadAttachments(activeAttachmentSession, attachments)
          : 0;
      const assignedAgentName = String(
        payload.requirement?.operationsHandoff?.assignedAgentName || "",
      ).trim();
      setAttachments([]);
      setAttachmentSession(null);
      setCaseReference(createdReference);
      setCaseAssignee(assignedAgentName || null);
      setStep("complete");
      appendAssistant(
        language === "fr"
          ? `Dossier ${createdReference} enregistre.${uploaded ? ` ${uploaded} ${uploaded > 1 ? copy.evidenceSavedPlural : copy.evidenceSaved}.` : ""}${assignedAgentName ? ` ${assignedAgentName} est assigne a la revue interne.` : ""} Aucun fournisseur n'est contacte automatiquement.`
          : `Case ${createdReference} has been recorded.${uploaded ? ` ${uploaded} ${uploaded > 1 ? copy.evidenceSavedPlural : copy.evidenceSaved}.` : ""}${assignedAgentName ? ` ${assignedAgentName} has been assigned to the internal review.` : ""} No supplier is contacted automatically.`,
      );
    } catch (nextError: any) {
      if (createdReference) {
        setCaseReference(createdReference);
        setAttachmentSession(activeAttachmentSession);
        setError(
          language === "fr"
            ? `Le dossier ${createdReference} est enregistre. Les fichiers peuvent etre renvoyes avant la fin de la session securisee.`
            : `Case ${createdReference} is recorded. You can retry the files before the secure upload session expires.`,
        );
      } else {
        setError(nextError?.message || copy.submissionError);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const sendMessage = async (value = draft) => {
    const message = value.trim();
    if (!message || isPreviewing || isCreating || step === "complete") return;

    setError(null);
    setDraft("");
    appendUser(message);

    if (step === "need") {
      setInitialNeed(message);
      setIsPreviewing(true);
      try {
        const response = await fetch(
          "/api/industrial/assistant/intake-preview",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              message,
              language,
              agentMode: commercialMode ? "commercial" : "concierge",
            }),
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !payload?.assistant?.intake) {
          throw new Error(payload?.message || copy.emptyMessage);
        }

        setIntake(payload.assistant.intake as IntakePreview);
        setStep("quantity");
        appendAssistant(
          `${String(payload.assistant.response || copy.emptyMessage)}\n\n${copy.quantityQuestion}`,
        );
      } catch (nextError: any) {
        const messageText = nextError?.message || copy.emptyMessage;
        setError(messageText);
        appendAssistant(messageText);
      } finally {
        setIsPreviewing(false);
      }
      return;
    }

    if (step === "quantity") {
      setQuantityText(message);
      ask("destination", copy.destinationQuestion);
      return;
    }

    if (step === "destination") {
      setDestination(message);
      ask("timing", copy.timingQuestion);
      return;
    }

    if (step === "timing") {
      setRequiredBy(message);
      ask("priority", copy.priorityQuestion);
      return;
    }

    if (step === "priority") {
      setPurchasePriority(message);
      continueToContact();
      return;
    }

    if (step === "name") {
      if (message.length < 2) {
        appendAssistant(copy.invalidName);
        return;
      }
      setRequesterName(message);
      if (requesterEmail.trim()) ask("company", copy.companyQuestion);
      else ask("email", copy.emailQuestion);
      return;
    }

    if (step === "email") {
      if (!isEmail(message)) {
        appendAssistant(copy.invalidEmail);
        return;
      }
      setRequesterEmail(message);
      ask("company", copy.companyQuestion);
      return;
    }

    if (step === "company") {
      setRequesterCompany(isSkipAnswer(message) ? "" : message);
      ask("confirm", copy.confirmationQuestion);
      return;
    }

    if (step === "confirm") {
      if (wantsQuantityChange(message)) {
        ask("quantity", copy.quantityQuestion);
        return;
      }
      if (wantsDestinationChange(message)) {
        ask("destination", copy.destinationQuestion);
        return;
      }
      if (isConfirmationAnswer(message)) {
        await createCase();
        return;
      }
      setAdditionalNotes((current) =>
        [current, message].filter(Boolean).join("; "),
      );
      appendAssistant(copy.noteAdded);
    }
  };

  const onAttachmentSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    const tooLarge = selected.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (tooLarge) {
      setError(copy.attachmentError);
      return;
    }

    setAttachments((current) => {
      const deduplicated = new Map(
        current.map((file) => [
          `${file.name}:${file.size}:${file.lastModified}`,
          file,
        ]),
      );
      selected.forEach((file) =>
        deduplicated.set(
          `${file.name}:${file.size}:${file.lastModified}`,
          file,
        ),
      );
      return Array.from(deduplicated.values()).slice(0, 5);
    });
  };

  const retryAttachments = async () => {
    if (!attachmentSession || !attachments.length || isCreating) return;
    setError(null);
    setIsCreating(true);
    try {
      const uploaded = await uploadAttachments(attachmentSession, attachments);
      setAttachments([]);
      setAttachmentSession(null);
      appendAssistant(
        language === "fr"
          ? `${uploaded} ${uploaded > 1 ? copy.evidenceSavedPlural : copy.evidenceSaved} au dossier ${caseReference}.`
          : `${uploaded} ${uploaded > 1 ? copy.evidenceSavedPlural : copy.evidenceSaved} for case ${caseReference}.`,
      );
    } catch (nextError: any) {
      setError(nextError?.message || copy.submissionError);
    } finally {
      setIsCreating(false);
    }
  };

  const unitLabel =
    product?.unitOfMeasure || (language === "fr" ? "unites" : "units");
  const quantityReplies = Array.from(
    new Set(
      [
        product?.minimumOrderQuantity
          ? `MOQ: ${product.minimumOrderQuantity}`
          : `10 ${unitLabel}`,
        `50 ${unitLabel}`,
        `100 ${unitLabel}`,
        language === "fr" ? "Je ne sais pas encore" : "I am not sure yet",
      ].filter(Boolean),
    ),
  );
  const activeQuickReplies =
    step === "need"
      ? context?.quickReplies?.length
        ? context.quickReplies
        : copy.firstReplies
      : step === "quantity"
        ? quantityReplies
        : step === "destination"
          ? copy.destinationReplies
          : step === "timing"
            ? copy.timingReplies
            : step === "priority"
              ? copy.priorityReplies
              : step === "company"
                ? [copy.skip]
                : step === "confirm"
                  ? [copy.confirm, copy.changeQuantity, copy.changeDestination]
                  : [];

  const showSummary = Boolean(intake && step !== "need");

  return (
    <section
      aria-label={visibleAgentName}
      data-testid="exportunity-ai-chat"
      data-conversation-mode={
        product
          ? "product-order"
          : commercialMode
            ? "commercial-intake"
            : "industrial-intake"
      }
      className={cn(
        "mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_54px_rgba(15,23,42,0.14)] backdrop-blur-md sm:mt-5 dark:border-[#F5A623]/35 dark:bg-[#02070e]/[0.96] dark:shadow-[0_22px_54px_rgba(0,0,0,0.32)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#07111F] px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#F5A623]/60 bg-[#07111F] p-1.5 shadow-[0_8px_20px_rgba(245,166,35,0.2)]">
            <img
              src={
                commercialMode
                  ? "/tenants/exportunity/industrial/awa-kouadio.webp"
                  : "/tenants/exportunity/machinery-logo.svg"
              }
              alt=""
              className={cn(
                "h-full w-full",
                commercialMode ? "rounded-lg object-cover" : "object-contain",
              )}
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {visibleAgentName}
            </span>
            <span className="block truncate text-xs text-slate-300">
              {product
                ? `${visibleAgentRole} | ${copy.productRole}`
                : visibleAgentRole}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-[#F5A623]/35 bg-[#F5A623]/10 px-2.5 py-1 text-[11px] font-semibold text-[#f8c45b]">
            {commercialMode
              ? language === "fr"
                ? "Awa est disponible"
                : "Awa is available"
              : copy.ready}
          </span>
          {product && onCloseProduct ? (
            <button
              type="button"
              onClick={onCloseProduct}
              aria-label={copy.close}
              title={copy.close}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {product ? (
        <div className="flex gap-3 border-b border-slate-200 bg-[#fffaf0] p-3 dark:border-white/10 dark:bg-[#F5A623]/[0.07]">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#07111F]">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center">
                <PackageSearch className="h-6 w-6 text-[#F5A623]" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950 dark:text-white">
              {product.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300">
              {product.factoryName || "Exportunity"}
              {product.factoryLocation ? ` | ${product.factoryLocation}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {product.minimumOrderQuantity ? (
                <span>
                  {copy.minimum}: {product.minimumOrderQuantity}
                </span>
              ) : null}
              {product.leadTimeText ? (
                <span>
                  {copy.leadTime}: {product.leadTimeText}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div
        ref={messageLogRef}
        className="max-h-[240px] space-y-3 overflow-y-auto bg-white px-3 py-3 sm:max-h-[300px] sm:px-4 dark:bg-transparent"
        aria-live="polite"
        aria-label={activeConversationLabel}
        role="log"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-5 shadow-sm sm:px-3.5 sm:py-3 sm:leading-6",
              message.sender === "assistant"
                ? "border border-slate-200 bg-slate-50 text-slate-800 dark:border-white/10 dark:bg-white/10 dark:text-slate-100"
                : "ml-auto bg-[#F5A623] text-[#07111F]",
            )}
          >
            {message.sender === "assistant" ? (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#946000] dark:text-[#f8c45b]">
                {visibleAgentName}
              </p>
            ) : null}
            <p className="whitespace-pre-wrap">{message.text}</p>
          </div>
        ))}
        {isPreviewing || isCreating ? (
          <div className="max-w-[86%] rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
            {isCreating ? activeCreatingLabel : activePreparingLabel}
          </div>
        ) : null}
      </div>

      {showSummary ? (
        <div
          data-testid="industrial-conversation-summary"
          className="border-t border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-black/10 sm:px-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">
              {copy.summary}
            </p>
            {caseReference ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {caseReference}
              </span>
            ) : null}
          </div>
          <dl className="mt-2 grid gap-x-3 gap-y-1.5 text-xs sm:grid-cols-2">
            {product?.factoryName ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {copy.producer}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {product.factoryName}
                </dd>
              </div>
            ) : null}
            {quantityText ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {copy.quantity}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {quantityText}
                </dd>
              </div>
            ) : null}
            {destination ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {copy.destination}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {destination}
                </dd>
              </div>
            ) : null}
            {requiredBy ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {copy.timing}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {requiredBy}
                </dd>
              </div>
            ) : null}
            {purchasePriority ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {copy.priority}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {purchasePriority}
                </dd>
              </div>
            ) : null}
            {requesterName || requesterEmail ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {copy.contact}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {[requesterName, requesterEmail].filter(Boolean).join(" | ")}
                </dd>
              </div>
            ) : null}
            {requesterCompany ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {copy.company}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {requesterCompany}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {activeQuickReplies.length && step !== "complete" ? (
        <div className="scrollbar-hide flex snap-x snap-mandatory gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2 sm:flex-wrap sm:overflow-visible sm:px-4 dark:border-white/10 dark:bg-transparent">
          {activeQuickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => void sendMessage(reply)}
              disabled={isPreviewing || isCreating}
              className="shrink-0 snap-start rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-[#F5A623]/80 hover:bg-[#F5A623]/15 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:shrink dark:border-white/20 dark:bg-white/10 dark:text-white"
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}

      {attachments.length ? (
        <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-transparent">
          <div className="flex flex-wrap gap-2">
            {attachments.map((file) => (
              <span
                key={`${file.name}:${file.size}:${file.lastModified}`}
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-slate-100"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#F5A623]" />
                <span className="max-w-[180px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter(
                        (item) =>
                          `${item.name}:${item.size}:${item.lastModified}` !==
                          `${file.name}:${file.size}:${file.lastModified}`,
                      ),
                    )
                  }
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label={`${language === "fr" ? "Retirer" : "Remove"} ${file.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {caseReference ? (
        <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-emerald-100">
          <span className="font-semibold">{caseReference}</span>
          <span className="ml-2">
            {language === "fr"
              ? caseAssignee
                ? `est assigne a ${caseAssignee} pour revue interne.`
                : "est enregistre. Aucun fournisseur n'est contacte automatiquement."
              : caseAssignee
                ? `is assigned to ${caseAssignee} for internal review.`
                : "has been recorded. No supplier is contacted automatically."}
          </span>
          {attachmentSession && attachments.length ? (
            <button
              type="button"
              onClick={() => void retryAttachments()}
              disabled={isCreating}
              className="mt-2 block text-xs font-semibold text-[#946000] hover:text-[#6f4700] disabled:cursor-not-allowed disabled:opacity-60 dark:text-[#f8c45b] dark:hover:text-[#ffe0a0]"
            >
              {language === "fr"
                ? "Renvoyer les fichiers joints"
                : "Retry attached files"}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="border-t border-rose-200 bg-rose-50 px-4 py-2.5 text-xs leading-5 text-rose-800 dark:border-rose-300/20 dark:bg-rose-300/10 dark:text-rose-100">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
        className="border-t border-white/10 bg-white px-2.5 py-2 shadow-[0_-10px_28px_rgba(0,0,0,0.16)] sm:px-3 sm:py-2.5"
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-end gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1.5 focus-within:border-[#F5A623] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#F5A623]/20 sm:gap-2">
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={step === "complete"}
            className="col-start-1 row-start-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#8d5a00] transition hover:bg-[#F5A623]/15 hover:text-[#07111F] disabled:cursor-not-allowed disabled:opacity-40 sm:row-start-1"
            aria-label={copy.attach}
            title={copy.attach}
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            ref={attachmentInputRef}
            type="file"
            multiple
            accept={ACCEPTED_ATTACHMENTS}
            className="sr-only"
            onChange={onAttachmentSelect}
          />
          <label className="col-span-4 col-start-1 row-start-1 min-w-0 sm:col-span-1 sm:col-start-2">
            <span className="sr-only">{activeComposerLabel}</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              disabled={step === "complete"}
              rows={1}
              maxLength={4000}
              className="block min-h-10 max-h-24 w-full resize-none bg-transparent px-1 py-2.5 text-sm leading-5 text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-500"
              placeholder={
                step === "complete"
                  ? copy.completePlaceholder
                  : commercialMode
                    ? language === "fr"
                      ? "Repondez a Awa..."
                      : "Reply to Awa..."
                    : copy.placeholder
              }
              aria-label={activeComposerLabel}
            />
          </label>
          <div className="col-start-3 row-start-2 [&_button]:!h-10 [&_button]:!w-10 sm:row-start-1">
            <VoiceToTextButton
              draftText={draft}
              setDraftText={setDraft}
              appendDraftText={(text) =>
                setDraft((current) => `${current} ${text}`.trim())
              }
              hideHelper
              disabled={step === "complete"}
              helperText={visibleAgentName}
              recordingText={
                language === "fr"
                  ? "Touchez pour arreter l'enregistrement"
                  : "Tap again to stop recording"
              }
              unavailableText={
                language === "fr"
                  ? "Microphone indisponible"
                  : "Microphone unavailable"
              }
            />
          </div>
          <button
            type="submit"
            disabled={
              !draft.trim() || isPreviewing || isCreating || step === "complete"
            }
            className="col-start-4 row-start-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#F5A623] text-[#07111F] transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-55 sm:row-start-1"
            aria-label={activeSendLabel}
            title={activeSendLabel}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
