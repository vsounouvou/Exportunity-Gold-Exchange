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
import {
  nextCommercialQualificationStep,
  unresolvedCommercialQualificationFields,
  type CommercialQualificationStep,
  type CommercialQualificationValues,
} from "@/components/exportunity/commercialQualification";
import { cn } from "@/lib/utils";

type Language = "fr" | "en";

export type IndustrialAssistantContext = {
  id: string;
  title: string;
  intro: string;
  role?: string;
  quickReplies?: string[];
  discoveryReplies?: string[];
  requirementType?: string | null;
  destinationReplies?: string[];
  territoryCode?: string | null;
  tradeIntake?: boolean;
  missionType?:
    | "trade"
    | "source"
    | "sell_export"
    | "manage_supply"
    | "market_expansion";
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
  territoryCode?: string | null;
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
  intent?: string;
  confidence?: number;
  commercial?: boolean;
  product?: {
    name?: string;
    category?: string;
    specification?: string;
    quantity?: string;
    unit?: string;
  };
  origin?: string;
  targetPrice?: string;
  currency?: string;
  deadline?: string;
  frequency?: string;
  incoterm?: string;
  customerType?: string;
  missingFields?: string[];
  suggestedAction?: "ANSWER" | "ASK" | "ACT" | "ESCALATE";
  facts?: {
    quantityText?: string;
    deliveryDestination?: string;
    requiredBy?: string;
    purchasePriority?: string;
  };
};

type ConversationStep =
  | "need"
  | "product"
  | "quantity"
  | "destination"
  | "timing"
  | "priority"
  | "frequency"
  | "origin"
  | "quality"
  | "incoterm"
  | "budget"
  | "confidentiality"
  | "communication"
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
    value.includes("cocody") ||
    value.includes("san-pedro")
  )
    return "CI";
  if (
    value.includes("emirats") ||
    value.includes("united arab emirates") ||
    value.includes("dubai") ||
    value.includes("jebel ali") ||
    value.includes("abu dhabi") ||
    value === "uae"
  )
    return "AE";
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

function quantityQuestionForRequirement(
  requirementType: string | null | undefined,
  language: Language,
) {
  if (requirementType === "machinery") {
    return language === "fr"
      ? "Avez-vous besoin d'une machine, d'une ligne complete ou de plusieurs lignes ? Ajoutez la capacite de production cible si vous la connaissez."
      : "Do you need one machine, one complete line, or several lines? Add the target production capacity if you know it.";
  }
  if (requirementType === "industrial_service") {
    return language === "fr"
      ? "Quel est le perimetre de l'intervention : une machine, une ligne ou plusieurs equipements ?"
      : "What is the service scope: one machine, one line, or several pieces of equipment?";
  }
  if (
    requirementType === "raw_material" ||
    requirementType === "industrial_input"
  ) {
    return language === "fr"
      ? "Quel volume ou conditionnement devez-vous approvisionner ?"
      : "What volume or packaging unit do you need to source?";
  }
  if (requirementType === "export_quotation") {
    return language === "fr"
      ? "Quel volume souhaitez-vous commander : lot d'essai, palettes ou conteneur ?"
      : "What volume would you like to order: a trial lot, pallets, or a container?";
  }
  if (
    requirementType === "spare_part" ||
    requirementType === "custom_manufacturing"
  ) {
    return language === "fr"
      ? "Combien de pieces vous faut-il ?"
      : "How many parts do you need?";
  }
  return language === "fr"
    ? "Quelle quantite ou quel volume souhaitez-vous commander ?"
    : "What quantity or volume would you like to order?";
}

function quantityRepliesForRequirement(
  requirementType: string | null | undefined,
  language: Language,
  unitLabel: string,
  minimumOrderQuantity?: string | null,
) {
  if (requirementType === "machinery") {
    return language === "fr"
      ? [
          "1 machine",
          "1 ligne complete",
          "Plusieurs lignes",
          "Capacite a definir",
          "J'ai un cahier des charges",
        ]
      : [
          "1 machine",
          "1 complete line",
          "Several lines",
          "Capacity to be defined",
          "I have a specification",
        ];
  }
  if (requirementType === "industrial_service") {
    return language === "fr"
      ? [
          "1 machine",
          "1 ligne de production",
          "Plusieurs equipements",
          "Tout le site",
          "Perimetre a evaluer",
        ]
      : [
          "1 machine",
          "1 production line",
          "Several machines",
          "The whole site",
          "Scope to assess",
        ];
  }
  if (
    requirementType === "raw_material" ||
    requirementType === "industrial_input"
  ) {
    return language === "fr"
      ? [
          "1 tonne",
          "10 tonnes",
          "1 camion",
          "1 conteneur",
          "Volume a definir",
        ]
      : [
          "1 tonne",
          "10 tonnes",
          "1 truckload",
          "1 container",
          "Volume to be defined",
        ];
  }
  if (requirementType === "export_quotation") {
    return language === "fr"
      ? [
          "Lot d'essai",
          "1 palette",
          "10 palettes",
          "1 conteneur",
          "Volume a definir",
        ]
      : [
          "Trial lot",
          "1 pallet",
          "10 pallets",
          "1 container",
          "Volume to be defined",
        ];
  }
  if (
    requirementType === "spare_part" ||
    requirementType === "custom_manufacturing"
  ) {
    return Array.from(
      new Set(
        [
          minimumOrderQuantity ? `MOQ: ${minimumOrderQuantity}` : `1 ${unitLabel}`,
          `5 ${unitLabel}`,
          `10 ${unitLabel}`,
          `50 ${unitLabel}`,
          language === "fr" ? "Quantite a confirmer" : "Quantity to confirm",
        ].filter(Boolean),
      ),
    );
  }
  return Array.from(
    new Set(
      [
        minimumOrderQuantity ? `MOQ: ${minimumOrderQuantity}` : `10 ${unitLabel}`,
        `50 ${unitLabel}`,
        `100 ${unitLabel}`,
        language === "fr" ? "Je ne sais pas encore" : "I am not sure yet",
      ].filter(Boolean),
    ),
  );
}

function destinationRepliesForTerritory(
  territoryCode: string | null | undefined,
  language: Language,
) {
  if (territoryCode === "CI") {
    return language === "fr"
      ? [
          "Abidjan, Cote d'Ivoire",
          "Port d'Abidjan",
          "San-Pedro, Cote d'Ivoire",
          "Livraison sur site",
          "Destination a preciser",
        ]
      : [
          "Abidjan, Cote d'Ivoire",
          "Port of Abidjan",
          "San-Pedro, Cote d'Ivoire",
          "Deliver to site",
          "Destination to be confirmed",
        ];
  }
  if (territoryCode === "AE") {
    return language === "fr"
      ? [
          "Dubai, Emirats arabes unis",
          "Port de Jebel Ali",
          "Abu Dhabi, Emirats arabes unis",
          "Livraison sur site",
          "Destination a preciser",
        ]
      : [
          "Dubai, United Arab Emirates",
          "Jebel Ali Port",
          "Abu Dhabi, United Arab Emirates",
          "Deliver to site",
          "Destination to be confirmed",
        ];
  }
  if (territoryCode === "BJ") {
    return language === "fr"
      ? [
          "Cotonou, Benin",
          "Port de Cotonou",
          "GDIZ, Glo-Djigbe",
          "Livraison sur site",
          "Destination a preciser",
        ]
      : [
          "Cotonou, Benin",
          "Port of Cotonou",
          "GDIZ, Glo-Djigbe",
          "Deliver to site",
          "Destination to be confirmed",
        ];
  }
  return [];
}

export function IndustrialAssistantChat({
  language,
  requester,
  context,
  product,
  mode = "commercial",
  onCloseProduct,
  onDiscoveryRequest,
  pane = false,
  className,
}: {
  language: Language;
  requester?: { displayName?: string | null; email?: string | null } | null;
  context?: IndustrialAssistantContext | null;
  product?: IndustrialAssistantProductContext | null;
  mode?: "concierge" | "commercial";
  onCloseProduct?: (() => void) | null;
  onDiscoveryRequest?: ((message: string) => string | null | void) | null;
  pane?: boolean;
  className?: string;
}) {
  const conversationIdRef = useRef(
    `industrial-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const copy =
    language === "fr"
      ? {
          name: "Awa Kouadio",
          role: "Exportunity AI | Directrice commerciale",
          productRole: "Commande industrielle accompagnee",
          conversation: "Conversation avec Awa",
          ready: "Awa est prete",
          composerLabel: "Envoyer un message a Awa",
          greeting:
            "Bonjour, je suis Awa Kouadio, votre interlocutrice commerciale Exportunity. Dites-moi ce que vous devez acheter, sourcer, fabriquer ou acheminer; je vais qualifier le besoin et convenir avec vous de la prochaine etape.",
          productGreeting: (
            name: string,
            factory: string,
            quantityQuestion: string,
          ) =>
            `Bonjour, je suis Awa, votre interlocutrice commerciale Exportunity. Vous consultez ${name}${factory ? `, propose par ${factory}` : ""}. Je vais preparer la commande avec vous, une question a la fois. ${quantityQuestion}`,
          placeholder: "Ecrivez votre reponse a Awa...",
          completePlaceholder: "Votre dossier est enregistre",
          attach: "Joindre une photo ou un fichier",
          send: "Envoyer a Awa",
          preparing: "Awa qualifie votre demande...",
          creating: "Awa enregistre votre dossier commercial...",
          attachmentError: "Chaque fichier doit faire 15 Mo ou moins.",
          emptyMessage:
            "Ajoutez plus de details sur la piece, la machine, la quantite ou le probleme a resoudre.",
          evidenceSaved:
            "fichier technique joint comme element de preuve prive pour la revue interne",
          evidenceSavedPlural:
            "fichiers techniques joints comme elements de preuve prives pour la revue interne",
          submissionError:
            "Le dossier n'a pas pu etre enregistre. Verifiez les informations puis reessayez.",
          productQuestion:
            "Quel produit, composant ou equipement recherchez-vous exactement ?",
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
          frequencyQuestion:
            "A quelle frequence ce besoin se repete-t-il ?",
          frequencyReplies: [
            "Achat ponctuel",
            "Chaque mois",
            "Approvisionnement recurrent",
            "Frequence a confirmer",
          ],
          originQuestion:
            "Avez-vous une origine fournisseur preferee ou des pays a exclure ?",
          originReplies: [
            "Aucune preference",
            "Afrique",
            "Moyen-Orient",
            "Europe ou Asie",
            "Je vais preciser",
          ],
          qualityQuestion:
            "Quelles exigences de qualite, de specification ou de certification devons-nous respecter ?",
          qualityReplies: [
            "Qualite commerciale standard",
            "Certification obligatoire",
            "J'ai une fiche technique",
            "Exigences a confirmer",
          ],
          incotermQuestion:
            "Quel Incoterm preferez-vous pour cette operation ? Je peux aussi vous aider a le choisir.",
          incotermReplies: ["EXW", "FOB", "CIF", "DDP", "Aidez-moi a choisir"],
          budgetQuestion:
            "Avez-vous une enveloppe budgetaire ou devons-nous d'abord etablir le prix de marche ?",
          budgetReplies: [
            "Budget deja defini",
            "Etablir le prix de marche",
            "Budget confidentiel",
            "A confirmer",
          ],
          confidentialityQuestion:
            "Quel niveau de confidentialite faut-il appliquer au dossier ?",
          confidentialityReplies: [
            "Traitement standard",
            "Demande confidentielle",
            "Accord de confidentialite requis",
          ],
          communicationQuestion:
            "Quel canal preferez-vous pour le suivi commercial ?",
          communicationReplies: [
            "Email",
            "WhatsApp",
            "Telephone",
            "Messagerie Exportunity",
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
          productLabel: "Produit",
          quantity: "Quantite",
          destination: "Livraison",
          timing: "Delai souhaite",
          priority: "Priorite",
          captured: "J'ai deja note",
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
          name: "Awa Kouadio",
          role: "Exportunity AI | Commercial Director",
          productRole: "Assisted industrial order",
          conversation: "Conversation with Awa",
          ready: "Awa is ready",
          composerLabel: "Message Awa",
          greeting:
            "Hello, I am Awa Kouadio, your Exportunity commercial lead. Tell me what you need to buy, source, manufacture, or move; I will qualify the requirement and agree the next step with you.",
          productGreeting: (
            name: string,
            factory: string,
            quantityQuestion: string,
          ) =>
            `Hello, I am Awa, your Exportunity commercial lead. You are viewing ${name}${factory ? `, offered by ${factory}` : ""}. I will prepare the order with you, one question at a time. ${quantityQuestion}`,
          placeholder: "Type your answer to Awa...",
          completePlaceholder: "Your case has been recorded",
          attach: "Attach a photo or file",
          send: "Send to Awa",
          preparing: "Awa is qualifying your request...",
          creating: "Awa is recording your commercial case...",
          attachmentError: "Each file must be 15 MB or smaller.",
          emptyMessage:
            "Add more detail about the part, machine, quantity, or issue to solve.",
          evidenceSaved:
            "technical file attached as private evidence for internal review",
          evidenceSavedPlural:
            "technical files attached as private evidence for internal review",
          submissionError:
            "The case could not be saved. Check the information and try again.",
          productQuestion:
            "Which exact product, component, or equipment are you looking for?",
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
          frequencyQuestion: "How often does this requirement repeat?",
          frequencyReplies: [
            "One-time purchase",
            "Every month",
            "Recurring supply",
            "Frequency to be confirmed",
          ],
          originQuestion:
            "Do you have a preferred supplier origin or countries to exclude?",
          originReplies: [
            "No preference",
            "Africa",
            "Middle East",
            "Europe or Asia",
            "I will specify",
          ],
          qualityQuestion:
            "Which quality, specification, or certification requirements must we meet?",
          qualityReplies: [
            "Standard commercial quality",
            "Certification required",
            "I have a technical specification",
            "Requirements to be confirmed",
          ],
          incotermQuestion:
            "Which Incoterm do you prefer for this transaction? I can also help you choose.",
          incotermReplies: ["EXW", "FOB", "CIF", "DDP", "Help me choose"],
          budgetQuestion:
            "Do you have a budget range, or should we establish market pricing first?",
          budgetReplies: [
            "Budget already defined",
            "Establish market pricing",
            "Budget is confidential",
            "To be confirmed",
          ],
          confidentialityQuestion:
            "Which confidentiality level should apply to this case?",
          confidentialityReplies: [
            "Standard handling",
            "Confidential request",
            "NDA required",
          ],
          communicationQuestion:
            "Which channel do you prefer for commercial follow-up?",
          communicationReplies: [
            "Email",
            "WhatsApp",
            "Phone",
            "Exportunity messaging",
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
          productLabel: "Product",
          quantity: "Quantity",
          destination: "Delivery",
          timing: "Needed by",
          priority: "Priority",
          captured: "I already captured",
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
  const globalTradeIntake = Boolean(context?.tradeIntake && !product);
  const activeGreeting = context?.intro || copy.greeting;
  const initialRequirementType =
    product?.requirementType || context?.requirementType || null;
  const initialQuantityQuestion = quantityQuestionForRequirement(
    initialRequirementType,
    language,
  );
  const productGreeting = product
    ? copy.productGreeting(
        product.name,
        product.factoryName || "",
        initialQuantityQuestion,
      )
    : activeGreeting;
  const visibleAgentName = commercialMode ? "Awa Kouadio" : copy.name;
  const visibleAgentRole = commercialMode
    ? language === "fr"
      ? "Directrice commerciale | Commandes & devis"
      : "Commercial Director | Orders & quotations"
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
        intent: "BUY_PRODUCT",
        confidence: 0.99,
        commercial: true,
        product: {
          name: product.name,
          category: product.categoryCode,
          unit: product.unitOfMeasure || undefined,
        },
        missingFields: ["product.quantity", "destination"],
        suggestedAction: "ASK",
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
  const [productName, setProductName] = useState(product?.name || "");
  const [quantityText, setQuantityText] = useState("");
  const [destination, setDestination] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [purchasePriority, setPurchasePriority] = useState("");
  const [frequency, setFrequency] = useState("");
  const [originPreference, setOriginPreference] = useState("");
  const [qualityRequirements, setQualityRequirements] = useState("");
  const [incoterm, setIncoterm] = useState("");
  const [budget, setBudget] = useState("");
  const [confidentiality, setConfidentiality] = useState("");
  const [preferredCommunication, setPreferredCommunication] = useState("");
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
  const activeRequirementType =
    initialRequirementType || intake?.requirementType || null;
  const activeQuantityQuestion = quantityQuestionForRequirement(
    activeRequirementType,
    language,
  );

  useEffect(() => {
    setMessages([
      { id: "welcome", sender: "assistant", text: productGreeting },
    ]);
    setDraft("");
    setAttachments([]);
    setIntake(initialIntake);
    setStep(initialStep);
    setInitialNeed("");
    setProductName(product?.name || "");
    setQuantityText("");
    setDestination("");
    setRequiredBy("");
    setPurchasePriority("");
    setFrequency("");
    setOriginPreference("");
    setQualityRequirements("");
    setIncoterm("");
    setBudget("");
    setConfidentiality("");
    setPreferredCommunication("");
    setAdditionalNotes("");
    setRequesterCompany("");
    setCaseReference(null);
    setCaseAssignee(null);
    setAttachmentSession(null);
    setError(null);
  }, [activeGreeting, language, product?.id, product?.name]);

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

  const qualificationValues = (
    overrides: Partial<CommercialQualificationValues> = {},
  ): CommercialQualificationValues => ({
    productName:
      overrides.productName !== undefined
        ? overrides.productName
        : productName || intake?.product?.name || product?.name || "",
    quantity:
      overrides.quantity !== undefined ? overrides.quantity : quantityText,
    destination:
      overrides.destination !== undefined
        ? overrides.destination
        : destination,
    deadline:
      overrides.deadline !== undefined ? overrides.deadline : requiredBy,
    origin:
      overrides.origin !== undefined ? overrides.origin : originPreference,
    specification:
      overrides.specification !== undefined
        ? overrides.specification
        : qualityRequirements || intake?.product?.specification || "",
    frequency:
      overrides.frequency !== undefined ? overrides.frequency : frequency,
    incoterm:
      overrides.incoterm !== undefined ? overrides.incoterm : incoterm,
    targetPrice:
      overrides.targetPrice !== undefined ? overrides.targetPrice : budget,
  });

  const qualificationQuestion = (next: CommercialQualificationStep) => {
    switch (next) {
      case "product":
        return copy.productQuestion;
      case "quantity":
        return activeQuantityQuestion;
      case "destination":
        return copy.destinationQuestion;
      case "timing":
        return copy.timingQuestion;
      case "origin":
        return copy.originQuestion;
      case "quality":
        return copy.qualityQuestion;
      case "frequency":
        return copy.frequencyQuestion;
      case "incoterm":
        return copy.incotermQuestion;
      case "budget":
        return copy.budgetQuestion;
    }
  };

  const continueAfterCoreRequirement = (
    overrides: Partial<CommercialQualificationValues> = {},
  ) => {
    const nextQualification = nextCommercialQualificationStep(
      intake?.missingFields,
      qualificationValues(overrides),
    );
    if (nextQualification) {
      ask(nextQualification, qualificationQuestion(nextQualification));
      return;
    }
    continueToContact();
  };

  const requirementDetails = () =>
    [
      productName ? `Product: ${productName}` : initialNeed,
      product?.factoryName ? `Producer: ${product.factoryName}` : "",
      product?.reference ? `Reference: ${product.reference}` : "",
      quantityText ? `Quantity: ${quantityText}` : "",
      destination ? `Delivery: ${destination}` : "",
      requiredBy ? `Needed by: ${requiredBy}` : "",
      purchasePriority ? `Buyer priority: ${purchasePriority}` : "",
      frequency ? `Frequency: ${frequency}` : "",
      originPreference ? `Preferred origin: ${originPreference}` : "",
      qualityRequirements
        ? `Quality and certification: ${qualityRequirements}`
        : "",
      incoterm ? `Incoterm: ${incoterm}` : "",
      budget ? `Budget: ${budget}` : "",
      confidentiality ? `Confidentiality: ${confidentiality}` : "",
      preferredCommunication
        ? `Preferred communication: ${preferredCommunication}`
        : "",
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
      const unresolvedQualification =
        unresolvedCommercialQualificationFields(
          intake.missingFields,
          qualificationValues(),
        );
      const resolvedSuggestedAction = intake.commercial
        ? unresolvedQualification.length
          ? "ASK"
          : "ACT"
        : intake.suggestedAction || "ANSWER";
      const technicalDetails: Record<string, string> = {
        intakeSource: product
          ? "exportunity_ai_product_order"
          : globalTradeIntake
            ? "exportunity_ai_global_trade_mission"
          : commercialMode
            ? "exportunity_ai_commercial_intake"
            : "exportunity_ai_industrial_intake",
        initialMessage: initialNeed || product?.name || intake.title,
        attachmentCount: String(attachments.length),
        commercialOwner: commercialMode ? "Awa Kouadio" : "",
        salesMethod: commercialMode
          ? "consultative_discovery_summary_next_step"
          : "",
        objectionMethod: commercialMode
          ? "listen_acknowledge_explore_respond"
          : "",
        closePolicy: commercialMode
          ? "mutually_agreed_specific_next_step_no_pressure"
          : "",
        commercialIntent: intake.intent || "GENERAL_QUESTION",
        commercialStage: "QUALIFYING",
        intentConfidence: String(intake.confidence || 0),
        suggestedAction: resolvedSuggestedAction,
        missingFields: unresolvedQualification.join(","),
      };
      if (intake.product?.name || productName)
        technicalDetails.detectedProductName =
          intake.product?.name || productName;
      if (intake.product?.category)
        technicalDetails.detectedProductCategory = intake.product.category;
      if (intake.product?.specification)
        technicalDetails.detectedProductSpecification =
          intake.product.specification;
      if (intake.customerType)
        technicalDetails.customerType = intake.customerType;
      if (intake.targetPrice)
        technicalDetails.targetPrice = intake.targetPrice;
      if (purchasePriority)
        technicalDetails.purchasePriority = purchasePriority;
      if (context?.missionType)
        technicalDetails.missionType = context.missionType;
      if (frequency) technicalDetails.frequency = frequency;
      if (originPreference)
        technicalDetails.originPreference = originPreference;
      if (qualityRequirements)
        technicalDetails.qualityRequirements = qualityRequirements;
      if (incoterm) technicalDetails.incoterm = incoterm;
      if (budget) technicalDetails.budget = budget;
      if (confidentiality)
        technicalDetails.confidentiality = confidentiality;
      if (preferredCommunication)
        technicalDetails.preferredCommunication = preferredCommunication;
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
          commercialContext: {
            intent: intake.intent || "GENERAL_QUESTION",
            confidence: intake.confidence || 0,
            suggestedAction: resolvedSuggestedAction,
            product: {
              name:
                intake.product?.name || productName || product?.name || undefined,
              category: intake.product?.category || undefined,
              specification:
                intake.product?.specification || qualityRequirements || undefined,
              quantity: intake.product?.quantity || quantityText || undefined,
              unit: intake.product?.unit || product?.unitOfMeasure || undefined,
            },
            origin: intake.origin || originPreference || undefined,
            destination: destination || undefined,
            targetPrice: intake.targetPrice || budget || undefined,
            currency: intake.currency || undefined,
            deadline: intake.deadline || requiredBy || undefined,
            frequency: intake.frequency || frequency || undefined,
            incoterm: intake.incoterm || incoterm || undefined,
            customerType: intake.customerType || undefined,
            missingFields: unresolvedQualification,
            sourceConversationId: conversationIdRef.current,
          },
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
      const specialistNames = Array.from(
        new Set(
          (payload.requirement?.operationsHandoff?.workstreams || [])
            .map((item: any) => String(item?.agentName || "").trim())
            .filter(Boolean),
        ),
      );
      setAttachments([]);
      setAttachmentSession(null);
      setCaseReference(createdReference);
      setCaseAssignee(assignedAgentName || null);
      setStep("complete");
      appendAssistant(
        language === "fr"
          ? `Dossier ${createdReference} enregistre.${uploaded ? ` ${uploaded} ${uploaded > 1 ? copy.evidenceSavedPlural : copy.evidenceSaved}.` : ""}${assignedAgentName ? ` ${assignedAgentName} pilote la revue commerciale.` : ""}${specialistNames.length ? ` Equipe mobilisee: ${specialistNames.join(", ")}. Chaque specialiste a un travail visible dans le Centre des operations.` : ""} Aucun fournisseur n'est contacte automatiquement.`
          : `Case ${createdReference} has been recorded.${uploaded ? ` ${uploaded} ${uploaded > 1 ? copy.evidenceSavedPlural : copy.evidenceSaved}.` : ""}${assignedAgentName ? ` ${assignedAgentName} owns the commercial review.` : ""}${specialistNames.length ? ` Mobilized team: ${specialistNames.join(", ")}. Each specialist has a visible Operations Center workstream.` : ""} No supplier is contacted automatically.`,
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

    const isDiscoveryRequest = context?.discoveryReplies?.some(
      (reply) =>
        reply.trim().toLocaleLowerCase() ===
        message.trim().toLocaleLowerCase(),
    );
    if (step === "need" && isDiscoveryRequest && onDiscoveryRequest) {
      const response = onDiscoveryRequest(message);
      if (response) appendAssistant(response);
      return;
    }

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
              requirementType: initialRequirementType || undefined,
              agentMode: commercialMode ? "commercial" : "concierge",
            }),
          },
        );
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !payload?.assistant?.intake) {
          throw new Error(payload?.message || copy.emptyMessage);
        }

        const nextIntake = payload.assistant.intake as IntakePreview;
        const facts = nextIntake.facts || {};
        const nextQuantity = facts.quantityText || "";
        const nextDestination = facts.deliveryDestination || "";
        const nextRequiredBy = facts.requiredBy || "";
        const nextPriority = facts.purchasePriority || "";
        const nextFrequency = String(nextIntake.frequency || "");
        const nextOrigin = String(nextIntake.origin || "");
        const nextQuality = String(
          nextIntake.product?.specification || "",
        );
        const nextIncoterm = String(nextIntake.incoterm || "");
        const nextBudget = String(nextIntake.targetPrice || "");
        setIntake(nextIntake);
        if (nextIntake.product?.name)
          setProductName(nextIntake.product.name);
        if (nextQuantity) setQuantityText(nextQuantity);
        if (nextDestination) setDestination(nextDestination);
        if (nextRequiredBy) setRequiredBy(nextRequiredBy);
        if (nextPriority) setPurchasePriority(nextPriority);
        if (nextFrequency) setFrequency(nextFrequency);
        if (nextOrigin) setOriginPreference(nextOrigin);
        if (nextQuality) setQualityRequirements(nextQuality);
        if (nextIncoterm) setIncoterm(nextIncoterm);
        if (nextBudget) setBudget(nextBudget);

        const capturedFacts = [
          nextQuantity
            ? `${language === "fr" ? "la quantite" : "quantity"} ${nextQuantity}`
            : "",
          nextDestination
            ? `${language === "fr" ? "la livraison a" : "delivery to"} ${nextDestination}`
            : "",
          nextRequiredBy
            ? `${language === "fr" ? "le delai" : "timing"} ${nextRequiredBy}`
            : "",
          nextPriority
            ? `${language === "fr" ? "la priorite" : "priority"} ${nextPriority}`
            : "",
        ].filter(Boolean);
        const capturedText = capturedFacts.length
          ? `${copy.captured} ${capturedFacts.join(language === "fr" ? ", " : ", ")}.`
          : "";

        let nextStep: ConversationStep;
        let nextQuestion: string;
        const commercialQualificationStep = nextCommercialQualificationStep(
          nextIntake.missingFields,
          {
            productName:
              nextIntake.product?.name || productName || product?.name || "",
            quantity: nextQuantity,
            destination: nextDestination,
            deadline: nextRequiredBy,
            origin: nextOrigin,
            specification: nextQuality,
            frequency: nextFrequency,
            incoterm: nextIncoterm,
            targetPrice: nextBudget,
          },
        );
        if (
          (nextIntake.commercial || globalTradeIntake) &&
          commercialQualificationStep
        ) {
          nextStep = commercialQualificationStep;
          nextQuestion = qualificationQuestion(commercialQualificationStep);
        } else if (nextIntake.commercial || globalTradeIntake) {
          nextStep = requesterName.trim()
            ? requesterEmail.trim()
              ? "company"
              : "email"
            : "name";
          nextQuestion = requesterName.trim()
            ? requesterEmail.trim()
              ? copy.companyQuestion
              : copy.emailQuestion
            : copy.nameQuestion;
        } else if (!nextQuantity) {
          nextStep = "quantity";
          nextQuestion = quantityQuestionForRequirement(
            nextIntake.requirementType,
            language,
          );
        } else if (!nextDestination) {
          nextStep = "destination";
          nextQuestion = copy.destinationQuestion;
        } else if (!nextRequiredBy) {
          nextStep = "timing";
          nextQuestion = copy.timingQuestion;
        } else if (!nextPriority) {
          nextStep = "priority";
          nextQuestion = copy.priorityQuestion;
        } else {
          nextStep = requesterName.trim()
            ? requesterEmail.trim()
              ? "company"
              : "email"
            : "name";
          nextQuestion = requesterName.trim()
            ? requesterEmail.trim()
              ? copy.companyQuestion
              : copy.emailQuestion
            : copy.nameQuestion;
        }
        setStep(nextStep);
        appendAssistant(
          [
            String(payload.assistant.response || copy.emptyMessage),
            capturedText,
            nextQuestion,
          ]
            .filter(Boolean)
            .join("\n\n"),
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

    if (step === "product") {
      setProductName(message);
      setIntake((current) =>
        current
          ? {
              ...current,
              product: { ...current.product, name: message },
            }
          : current,
      );
      continueAfterCoreRequirement({ productName: message });
      return;
    }

    if (step === "quantity") {
      setQuantityText(message);
      if (intake?.commercial || globalTradeIntake) {
        continueAfterCoreRequirement({ quantity: message });
        return;
      }
      if (!destination) ask("destination", copy.destinationQuestion);
      else if (!requiredBy) ask("timing", copy.timingQuestion);
      else if (!purchasePriority) ask("priority", copy.priorityQuestion);
      else continueAfterCoreRequirement();
      return;
    }

    if (step === "destination") {
      setDestination(message);
      if (intake?.commercial || globalTradeIntake) {
        continueAfterCoreRequirement({ destination: message });
        return;
      }
      if (!requiredBy) ask("timing", copy.timingQuestion);
      else if (!purchasePriority) ask("priority", copy.priorityQuestion);
      else continueAfterCoreRequirement();
      return;
    }

    if (step === "timing") {
      setRequiredBy(message);
      if (intake?.commercial || globalTradeIntake) {
        continueAfterCoreRequirement({ deadline: message });
        return;
      }
      if (!purchasePriority) ask("priority", copy.priorityQuestion);
      else continueAfterCoreRequirement();
      return;
    }

    if (step === "priority") {
      setPurchasePriority(message);
      continueAfterCoreRequirement();
      return;
    }

    if (step === "frequency") {
      setFrequency(message);
      continueAfterCoreRequirement({ frequency: message });
      return;
    }

    if (step === "origin") {
      setOriginPreference(message);
      continueAfterCoreRequirement({ origin: message });
      return;
    }

    if (step === "quality") {
      setQualityRequirements(message);
      continueAfterCoreRequirement({ specification: message });
      return;
    }

    if (step === "incoterm") {
      setIncoterm(message);
      continueAfterCoreRequirement({ incoterm: message });
      return;
    }

    if (step === "budget") {
      setBudget(message);
      continueAfterCoreRequirement({ targetPrice: message });
      return;
    }

    if (step === "confidentiality") {
      setConfidentiality(message);
      ask("communication", copy.communicationQuestion);
      return;
    }

    if (step === "communication") {
      setPreferredCommunication(message);
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
        ask("quantity", activeQuantityQuestion);
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
  const quantityReplies = quantityRepliesForRequirement(
    activeRequirementType,
    language,
    unitLabel,
    product?.minimumOrderQuantity,
  );
  const territoryDestinationReplies = destinationRepliesForTerritory(
    product?.territoryCode || context?.territoryCode,
    language,
  );
  const destinationReplies = context?.destinationReplies?.length
    ? context.destinationReplies
    : territoryDestinationReplies.length
      ? territoryDestinationReplies
      : copy.destinationReplies;
  const activeQuickReplies =
    step === "need"
      ? context?.quickReplies?.length
        ? context.quickReplies
        : copy.firstReplies
      : step === "quantity"
        ? quantityReplies
        : step === "destination"
          ? destinationReplies
          : step === "timing"
            ? copy.timingReplies
            : step === "priority"
              ? copy.priorityReplies
              : step === "frequency"
                ? copy.frequencyReplies
                : step === "origin"
                  ? copy.originReplies
                  : step === "quality"
                    ? copy.qualityReplies
                    : step === "incoterm"
                      ? copy.incotermReplies
                      : step === "budget"
                        ? copy.budgetReplies
                        : step === "confidentiality"
                          ? copy.confidentialityReplies
                          : step === "communication"
                            ? copy.communicationReplies
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
          : globalTradeIntake
            ? "global-trade-mission"
          : commercialMode
            ? "commercial-intake"
            : "industrial-intake"
      }
      className={cn(
        "mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_54px_rgba(15,23,42,0.14)] backdrop-blur-md sm:mt-5 dark:border-[#F5A623]/35 dark:bg-[#02070e]/[0.96] dark:shadow-[0_22px_54px_rgba(0,0,0,0.32)]",
        pane && "flex min-h-0 flex-col",
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
                  : "/tenants/exportunity/official/icon-transparent-2048.png"
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
        className={cn(
          "space-y-3 overflow-y-auto bg-white px-3 py-3 sm:px-4 dark:bg-transparent",
          pane
            ? "min-h-0 flex-1"
            : "max-h-[240px] sm:max-h-[300px]",
        )}
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
            {productName ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {copy.productLabel}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {productName}
                </dd>
              </div>
            ) : null}
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
            {frequency ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {language === "fr" ? "Frequence" : "Frequency"}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {frequency}
                </dd>
              </div>
            ) : null}
            {incoterm ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">Incoterm</dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {incoterm}
                </dd>
              </div>
            ) : null}
            {confidentiality ? (
              <div className="min-w-0">
                <dt className="text-slate-500 dark:text-slate-400">
                  {language === "fr" ? "Confidentialite" : "Confidentiality"}
                </dt>
                <dd className="truncate font-medium text-slate-900 dark:text-white">
                  {confidentiality}
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
