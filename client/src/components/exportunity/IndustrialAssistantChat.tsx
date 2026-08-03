import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link } from "wouter";
import { MessageCircle, Paperclip, Send, Trash2 } from "lucide-react";

import { VoiceToTextButton } from "@/components/chat/VoiceToTextButton";
import { cn } from "@/lib/utils";

type Language = "fr" | "en";

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

export function IndustrialAssistantChat({
  language,
  requester,
}: {
  language: Language;
  requester?: { displayName?: string | null; email?: string | null } | null;
}) {
  const copy =
    language === "fr"
      ? {
          name: "Exportunity AI",
          role: "Assistant sourcing et operations",
          conversation: "Conversation avec Exportunity AI",
          ready: "Conversation prete",
          composerLabel: "Votre message a Exportunity AI",
          greeting:
            "Bonjour. Decrivez une piece, une machine, une matiere ou un besoin de transport. Je prepare le bon dossier technique avant toute mise en relation.",
          placeholder:
            "Ecrivez votre besoin industriel ou expliquez ce qui bloque la production...",
          attach: "Joindre une photo ou un fichier",
          send: "Envoyer a Exportunity AI",
          preparing: "Exportunity AI organise votre demande...",
          contactTitle: "Ouvrir le dossier technique",
          contactText:
            "Ajoutez vos coordonnees professionnelles pour enregistrer le dossier. Aucun fournisseur n'est contacte a cette etape.",
          nameLabel: "Nom",
          emailLabel: "Email professionnel",
          companyLabel: "Entreprise (facultatif)",
          create: "Creer le dossier",
          creating: "Creation du dossier...",
          continue: "Completer le dossier technique",
          attachmentError: "Chaque fichier doit faire 15 Mo ou moins.",
          emptyMessage:
            "Ajoutez plus de details sur la piece, la machine, la quantite ou le probleme a resoudre.",
          submissionError:
            "Le dossier n'a pas pu etre enregistre. Verifiez vos coordonnees puis reessayez.",
          firstReplies: [
            "Je cherche une piece detachee urgente",
            "Je dois sourcer une machine",
            "Je cherche une matiere premiere",
            "Je veux refaire une piece localement",
            "J'ai besoin de logistique ou import",
          ],
        }
      : {
          name: "Exportunity AI",
          role: "Sourcing and operations assistant",
          conversation: "Conversation with Exportunity AI",
          ready: "Conversation ready",
          composerLabel: "Your message to Exportunity AI",
          greeting:
            "Hello. Describe a part, machine, material, or transport need. I will prepare the right technical case before any introduction is made.",
          placeholder:
            "Describe your industrial need or explain what is blocking production...",
          attach: "Attach a photo or file",
          send: "Send to Exportunity AI",
          preparing: "Exportunity AI is organizing your request...",
          contactTitle: "Open the technical case",
          contactText:
            "Add your business details to record this case. No supplier is contacted at this stage.",
          nameLabel: "Name",
          emailLabel: "Work email",
          companyLabel: "Company (optional)",
          create: "Create case",
          creating: "Creating case...",
          continue: "Complete the technical case",
          attachmentError: "Each file must be 15 MB or smaller.",
          emptyMessage:
            "Add more detail about the part, machine, quantity, or issue to solve.",
          submissionError:
            "The case could not be saved. Check your details and try again.",
          firstReplies: [
            "I need an urgent spare part",
            "I need to source a production machine",
            "I need a raw material",
            "I need to reproduce a part locally",
            "I need logistics or import support",
          ],
        };
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    { id: "welcome", sender: "assistant", text: copy.greeting },
  ]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [intake, setIntake] = useState<IntakePreview | null>(null);
  const [lastMessage, setLastMessage] = useState("");
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

  useEffect(() => {
    setMessages([{ id: "welcome", sender: "assistant", text: copy.greeting }]);
    setIntake(null);
    setCaseReference(null);
    setCaseAssignee(null);
    setAttachmentSession(null);
    setError(null);
  }, [copy.greeting]);

  useEffect(() => {
    if (requester?.displayName) setRequesterName(requester.displayName);
    if (requester?.email) setRequesterEmail(requester.email);
  }, [requester?.displayName, requester?.email]);

  const sendMessage = async (value = draft) => {
    const message = value.trim();
    if (!message || isPreviewing) return;

    setError(null);
    setDraft("");
    setLastMessage(message);
    setIntake(null);
    setCaseReference(null);
    setCaseAssignee(null);
    setAttachmentSession(null);
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, sender: "user", text: message },
    ]);
    setIsPreviewing(true);

    try {
      const response = await fetch("/api/industrial/assistant/intake-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, language }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload?.assistant?.intake) {
        throw new Error(payload?.message || copy.emptyMessage);
      }

      setIntake(payload.assistant.intake as IntakePreview);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: String(payload.assistant.response || copy.emptyMessage),
        },
      ]);
    } catch (nextError: any) {
      const messageText = nextError?.message || copy.emptyMessage;
      setError(messageText);
      setMessages((current) => [
        ...current,
        { id: `assistant-error-${Date.now()}`, sender: "assistant", text: messageText },
      ]);
    } finally {
      setIsPreviewing(false);
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

  const createCase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!intake || !lastMessage || isCreating) return;

    setError(null);
    setIsCreating(true);
    let createdReference: string | null = null;
    let activeAttachmentSession: AttachmentSession | null = null;
    try {
      const response = await fetch("/api/industrial/requirements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requirementType: intake.requirementType,
          categoryCode: intake.categoryCode,
          title: intake.title,
          details: lastMessage,
          urgency: intake.urgency,
          requesterCompany: requesterCompany.trim() || null,
          requesterName: requesterName.trim(),
          requesterEmail: requesterEmail.trim(),
          technicalDetails: {
            intakeSource: "exportunity_ai_home",
            initialMessage: lastMessage,
            attachmentCount: String(attachments.length),
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
      const reference = createdReference;
      const assignedAgentName = String(
        payload.requirement?.operationsHandoff?.assignedAgentName || "",
      ).trim();
      setAttachments([]);
      setAttachmentSession(null);
      setCaseReference(reference);
      setCaseAssignee(assignedAgentName || null);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-case-${Date.now()}`,
          sender: "assistant",
          text:
            language === "fr"
              ? `Dossier ${reference} enregistre${uploaded ? ` avec ${uploaded} fichier${uploaded > 1 ? "s" : ""}` : ""}.${assignedAgentName ? ` ${assignedAgentName} est assigne a la revue interne.` : ""} Aucun fournisseur n'est contacte automatiquement.`
              : `Case ${reference} has been recorded${uploaded ? ` with ${uploaded} file${uploaded > 1 ? "s" : ""}` : ""}.${assignedAgentName ? ` ${assignedAgentName} has been assigned to the internal review.` : ""} No supplier is contacted automatically.`,
        },
      ]);
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

  const retryAttachments = async () => {
    if (!attachmentSession || !attachments.length || isCreating) return;
    setError(null);
    setIsCreating(true);
    try {
      const uploaded = await uploadAttachments(attachmentSession, attachments);
      setAttachments([]);
      setAttachmentSession(null);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-upload-${Date.now()}`,
          sender: "assistant",
          text:
            language === "fr"
              ? `${uploaded} fichier${uploaded > 1 ? "s" : ""} joint${uploaded > 1 ? "s" : ""} au dossier ${caseReference}.`
              : `${uploaded} file${uploaded > 1 ? "s" : ""} attached to case ${caseReference}.`,
        },
      ]);
    } catch (nextError: any) {
      setError(nextError?.message || copy.submissionError);
    } finally {
      setIsCreating(false);
    }
  };

  const fullCaseHref = intake
    ? `/request-quote?type=${encodeURIComponent(intake.requirementType)}&category=${encodeURIComponent(intake.categoryCode)}&title=${encodeURIComponent(intake.title)}`
    : "/request-quote";

  return (
    <section
      aria-label={copy.name}
      data-testid="exportunity-ai-chat"
      className="mt-5 overflow-hidden rounded-2xl border border-[#F5A623]/35 bg-[#02070e]/80 shadow-[0_22px_54px_rgba(0,0,0,0.32)] backdrop-blur-md sm:mt-7"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#F5A623]/60 bg-[#07111F] p-1.5 shadow-[0_8px_20px_rgba(245,166,35,0.2)]">
            <img
              src="/tenants/exportunity/machinery-logo.svg"
              alt=""
              className="h-full w-full object-contain"
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">
              {copy.name}
            </span>
            <span className="block truncate text-xs text-slate-300">
              {copy.role}
            </span>
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-[#F5A623]/35 bg-[#F5A623]/10 px-2.5 py-1 text-[11px] font-semibold text-[#f8c45b]">
          {copy.ready}
        </span>
      </div>

      <div
        className="max-h-[230px] space-y-3 overflow-y-auto px-3 py-3 sm:max-h-[280px] sm:px-4 sm:py-4"
        aria-live="polite"
        aria-label={copy.conversation}
        role="log"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-5 shadow-sm sm:px-3.5 sm:py-3 sm:leading-6",
              message.sender === "assistant"
                ? "border border-white/10 bg-white/10 text-slate-100"
                : "ml-auto bg-[#F5A623] text-[#07111F]",
            )}
          >
            {message.sender === "assistant" ? (
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f8c45b]">
                {copy.name}
              </p>
            ) : null}
            <p>{message.text}</p>
          </div>
        ))}
        {isPreviewing ? (
          <div className="max-w-[86%] rounded-2xl border border-white/10 bg-white/10 px-3.5 py-3 text-sm text-slate-200">
            {copy.preparing}
          </div>
        ) : null}
      </div>

      {!intake ? (
        <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 py-2 sm:flex-wrap sm:overflow-visible sm:px-4 sm:py-3">
          {copy.firstReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              onClick={() => void sendMessage(reply)}
              disabled={isPreviewing}
              className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:border-[#F5A623]/80 hover:bg-[#F5A623]/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}

      {attachments.length ? (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {attachments.map((file) => (
              <span
                key={`${file.name}:${file.size}:${file.lastModified}`}
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs text-slate-100"
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
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-300 hover:bg-white/10 hover:text-white"
                  aria-label={`${language === "fr" ? "Retirer" : "Remove"} ${file.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {intake && !caseReference ? (
        <form onSubmit={createCase} className="border-t border-white/10 bg-black/10 p-4">
          <p className="text-sm font-semibold text-white">{copy.contactTitle}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{copy.contactText}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium text-slate-200">
              {copy.nameLabel}
              <input
                value={requesterName}
                onChange={(event) => setRequesterName(event.target.value)}
                required
                minLength={2}
                className="h-10 rounded-lg border border-white/20 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/30"
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-slate-200">
              {copy.emailLabel}
              <input
                type="email"
                value={requesterEmail}
                onChange={(event) => setRequesterEmail(event.target.value)}
                required
                className="h-10 rounded-lg border border-white/20 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/30"
              />
            </label>
          </div>
          <label className="mt-2 grid gap-1 text-xs font-medium text-slate-200">
            {copy.companyLabel}
            <input
              value={requesterCompany}
              onChange={(event) => setRequesterCompany(event.target.value)}
              className="h-10 rounded-lg border border-white/20 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/30"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#F5A623] px-4 text-sm font-semibold text-[#07111F] transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {isCreating ? copy.creating : copy.create}
            </button>
            <Link
              href={fullCaseHref}
              className="text-sm font-semibold text-[#f8c45b] hover:text-[#ffe0a0]"
            >
              {copy.continue}
            </Link>
          </div>
        </form>
      ) : null}

      {caseReference ? (
        <div className="border-t border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
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
              className="mt-2 block text-xs font-semibold text-[#f8c45b] hover:text-[#ffe0a0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {language === "fr"
                ? "Renvoyer les fichiers joints"
                : "Retry attached files"}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="border-t border-rose-300/20 bg-rose-300/10 px-4 py-2.5 text-xs leading-5 text-rose-100">
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
        <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 focus-within:border-[#F5A623] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#F5A623]/20">
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#8d5a00] transition hover:bg-[#F5A623]/15 hover:text-[#07111F]"
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
          <MessageCircle className="mb-2 h-4 w-4 shrink-0 text-[#a96f0b]" aria-hidden="true" />
          <label className="min-w-0 flex-1">
            <span className="sr-only">{copy.composerLabel}</span>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              rows={2}
              maxLength={4000}
              className="block min-h-10 w-full resize-none bg-transparent px-1 py-1.5 text-sm leading-5 text-slate-950 outline-none placeholder:text-slate-400"
              placeholder={copy.placeholder}
              aria-label={copy.composerLabel}
            />
          </label>
          <VoiceToTextButton
            draftText={draft}
            setDraftText={setDraft}
            appendDraftText={(text) =>
              setDraft((current) => `${current} ${text}`.trim())
            }
            hideHelper
            helperText={copy.name}
            recordingText={
              language === "fr"
                ? "Touchez pour arreter l'enregistrement"
                : "Tap again to stop recording"
            }
            unavailableText={
              language === "fr" ? "Microphone indisponible" : "Microphone unavailable"
            }
          />
          <button
            type="submit"
            disabled={!draft.trim() || isPreviewing}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#F5A623] text-[#07111F] transition hover:bg-[#f9a800] disabled:cursor-not-allowed disabled:opacity-55"
            aria-label={copy.send}
            title={copy.send}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
