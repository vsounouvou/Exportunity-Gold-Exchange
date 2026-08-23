import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Loader2,
  Send,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface ExportunityApplicationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ExportunityApplicationStep {
  id: number;
  title: string;
  description: string;
}

interface NetworkFrameProps {
  children: ReactNode;
  testId: string;
  lockViewport?: boolean;
}

function NetworkFrame({ children, testId, lockViewport = false }: NetworkFrameProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "relative flex min-h-screen flex-col overflow-hidden bg-[#F7F8FA] text-[#07111F]",
        lockViewport && "h-[100dvh] min-h-0",
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="pointer-events-none absolute -left-40 top-24 h-96 w-96 rounded-full bg-[#F5A623]/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-sky-300/15 blur-3xl" />
      {children}
    </div>
  );
}

interface NetworkHeaderProps {
  backHref?: string;
  backLabel?: string;
  stepLabel?: string;
}

function NetworkHeader({ backHref = "/", backLabel = "Back to network", stepLabel }: NetworkHeaderProps) {
  return (
    <header className="relative z-20 shrink-0 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="inline-flex min-w-0 items-center gap-3">
          <img
            src="/tenants/exportunity/official/logo-long-light.png"
            alt="Exportunity"
            className="h-9 w-auto max-w-[190px] object-contain"
          />
          <span className="hidden border-l border-slate-200 pl-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 lg:block">
            Global Trade Network
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {stepLabel ? (
            <Badge className="shrink-0 whitespace-nowrap border-[#F5A623]/35 bg-[#FFF8E8] text-[10px] font-black uppercase tracking-[0.14em] text-[#8A5700] hover:bg-[#FFF8E8]">
              {stepLabel}
            </Badge>
          ) : null}
          <Button asChild type="button" variant="outline" className="h-9 border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-[#F5A623] hover:bg-white hover:text-slate-950">
            <Link href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
              <span className="sm:hidden">Back</span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function ExportunityApplicationLoading({ testId }: { testId: string }) {
  return (
    <NetworkFrame testId={testId}>
      <NetworkHeader />
      <div className="relative z-10 grid flex-1 place-items-center px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 text-center shadow-sm">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#B26F00]" />
          <p className="mt-3 text-sm font-bold text-slate-700">Loading your application record…</p>
        </div>
      </div>
    </NetworkFrame>
  );
}

export interface ExportunityApplicationStatusMetric {
  label: string;
  value: string;
}

interface ExportunityApplicationStatusProps {
  testId: string;
  icon: LucideIcon;
  status: string;
  applicationId: number;
  approvedTitle: string;
  approvedDescription: string;
  rejectedDescription: string;
  reviewDescription: string;
  metrics?: ExportunityApplicationStatusMetric[];
  approvedAction?: { href: string; label: string };
  backHref?: string;
  backLabel?: string;
}

export function ExportunityApplicationStatus({
  testId,
  icon: PendingIcon,
  status,
  applicationId,
  approvedTitle,
  approvedDescription,
  rejectedDescription,
  reviewDescription,
  metrics = [],
  approvedAction,
  backHref,
  backLabel,
}: ExportunityApplicationStatusProps) {
  const approved = status === "approved";
  const rejected = status === "rejected";
  const StatusIcon = approved ? CheckCircle2 : rejected ? AlertCircle : PendingIcon;
  const title = approved ? approvedTitle : rejected ? "Application declined" : "Application under review";
  const description = approved ? approvedDescription : rejected ? rejectedDescription : reviewDescription;

  return (
    <NetworkFrame testId={testId}>
      <NetworkHeader backHref={backHref} backLabel={backLabel} />
      <main className="relative z-10 mx-auto grid w-full max-w-4xl flex-1 place-items-center px-4 py-10 sm:px-6">
        <section className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-2 shadow-[0_30px_90px_rgba(15,23,42,0.14)]">
          <div className="rounded-[22px] border border-slate-100 px-5 py-8 sm:px-9">
            <div
              className={cn(
                "mx-auto grid h-16 w-16 place-items-center rounded-2xl",
                approved
                  ? "bg-emerald-50 text-emerald-700"
                  : rejected
                    ? "bg-rose-50 text-rose-700"
                    : "bg-[#FFF8E8] text-[#B26F00]",
              )}
            >
              <StatusIcon className="h-8 w-8" />
            </div>
            <div className="mx-auto mt-5 max-w-lg text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A5700]">
                Global Trade Network access
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-[#07111F] sm:text-3xl">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
            </div>

            <dl className="mt-7 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <div className="flex items-center justify-between gap-4 py-3 text-sm">
                <dt className="font-semibold text-slate-500">Application ID</dt>
                <dd className="font-mono font-black text-slate-950">#{applicationId}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3 text-sm">
                <dt className="font-semibold text-slate-500">Review status</dt>
                <dd>
                  <Badge
                    className={cn(
                      "font-black capitalize",
                      approved
                        ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                        : rejected
                          ? "bg-rose-100 text-rose-800 hover:bg-rose-100"
                          : "bg-amber-100 text-amber-900 hover:bg-amber-100",
                    )}
                  >
                    {status.replaceAll("_", " ")}
                  </Badge>
                </dd>
              </div>
              {metrics.map((metric) => (
                <div key={metric.label} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <dt className="font-semibold text-slate-500">{metric.label}</dt>
                  <dd className="text-right font-black text-slate-950">{metric.value}</dd>
                </div>
              ))}
            </dl>

            {approved && approvedAction ? (
              <Button asChild className="mt-6 h-12 w-full bg-[#F5A623] font-black text-[#07111F] hover:bg-[#F8C45B]">
                <Link href={approvedAction.href}>{approvedAction.label}</Link>
              </Button>
            ) : null}
          </div>
        </section>
      </main>
    </NetworkFrame>
  );
}

interface ExportunityApplicationConversationProps {
  testId: string;
  title: string;
  description: string;
  icon: LucideIcon;
  steps: ExportunityApplicationStep[];
  currentStep: number;
  messages: ExportunityApplicationMessage[];
  isLoading: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  canSubmit: boolean;
  onSubmit: () => void;
  submitPending: boolean;
  backHref?: string;
  backLabel?: string;
}

export function ExportunityApplicationConversation({
  testId,
  title,
  description,
  icon: PageIcon,
  steps,
  currentStep,
  messages,
  isLoading,
  input,
  onInputChange,
  onInputKeyDown,
  onSend,
  canSubmit,
  onSubmit,
  submitPending,
  backHref,
  backLabel,
}: ExportunityApplicationConversationProps) {
  const progress = Math.min(100, Math.max(0, (currentStep / Math.max(steps.length, 1)) * 100));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isLoading, messages]);

  return (
    <NetworkFrame testId={testId} lockViewport>
      <NetworkHeader
        backHref={backHref}
        backLabel={backLabel}
        stepLabel={`Step ${currentStep} of ${steps.length}`}
      />

      <main className="relative z-10 mx-auto grid min-h-0 w-full max-w-7xl flex-1 gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6 lg:py-6">
        <aside className="hidden h-full min-h-0 rounded-[24px] border border-slate-200 bg-white/95 p-5 shadow-sm lg:flex lg:flex-col">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#07111F] text-[#F5A623]">
            <PageIcon className="h-5 w-5" />
          </span>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-[#8A5700]">Partner access</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#07111F]">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
          <Progress value={progress} className="mt-6 h-1.5 bg-slate-100 [&>div]:bg-[#F5A623]" />

          <ol className="mt-6 space-y-2 overflow-y-auto pr-1">
            {steps.map((step) => {
              const completed = step.id < currentStep;
              const active = step.id === currentStep;
              return (
                <li
                  key={step.id}
                  className={cn(
                    "flex gap-3 rounded-xl border px-3 py-3 transition",
                    completed
                      ? "border-emerald-100 bg-emerald-50/70"
                      : active
                        ? "border-[#F5A623]/45 bg-[#FFF8E8]"
                        : "border-transparent bg-slate-50",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black",
                      completed
                        ? "bg-emerald-700 text-white"
                        : active
                          ? "bg-[#07111F] text-[#F5A623]"
                          : "bg-white text-slate-400",
                    )}
                  >
                    {completed ? <CheckCircle2 className="h-4 w-4" /> : step.id}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-slate-900">{step.title}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-slate-500">{step.description}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#07111F] text-[#F5A623] lg:hidden">
                <PageIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-base font-black text-slate-950 lg:text-lg">{title}</h1>
                <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
              </div>
            </div>
            <Progress value={progress} className="mt-3 h-1 bg-slate-100 [&>div]:bg-[#F5A623] lg:hidden" />
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
              {steps.map((step) => {
                const completed = step.id < currentStep;
                const active = step.id === currentStep;
                return (
                  <span
                    key={step.id}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold",
                      completed
                        ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                        : active
                          ? "border-[#F5A623]/40 bg-[#FFF8E8] text-[#8A5700]"
                          : "border-slate-200 bg-slate-50 text-slate-400",
                    )}
                  >
                    {completed ? <CheckCircle2 className="h-3 w-3" /> : null}
                    {step.title}
                  </span>
                );
              })}
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 bg-slate-50/60">
            <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6">
              {messages.map((message) => {
                const userMessage = message.role === "user";
                const systemMessage = message.role === "system";
                return (
                  <div
                    key={message.id}
                    className={cn("flex items-start gap-3", userMessage ? "justify-end" : "justify-start")}
                  >
                    {!userMessage ? (
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                          systemMessage ? "bg-emerald-100 text-emerald-700" : "bg-[#FFF0C7] text-[#8A5700]",
                        )}
                      >
                        {systemMessage ? <CheckCircle2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
                        userMessage
                          ? "rounded-tr-md bg-[#07111F] text-white"
                          : systemMessage
                            ? "rounded-tl-md border border-emerald-200 bg-emerald-50 text-emerald-950"
                            : "rounded-tl-md border border-slate-200 bg-white text-slate-700",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {userMessage ? (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-200 text-slate-600">
                        <UserRound className="h-4 w-4" />
                      </span>
                    ) : null}
                  </div>
                );
              })}
              {isLoading ? (
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#FFF0C7] text-[#8A5700]">
                    <Bot className="h-4 w-4" />
                  </span>
                  <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5" aria-label="Application desk is responding">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="h-2 w-2 animate-bounce rounded-full bg-slate-400"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
            <div className="mx-auto flex w-full max-w-3xl gap-2">
              <Input
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={canSubmit ? "Add another detail or submit your file…" : "Type your response…"}
                className="h-11 flex-1 border-slate-200 bg-slate-50 text-[#07111F] placeholder:text-slate-400 focus-visible:ring-[#F5A623]"
                disabled={isLoading}
              />
              {canSubmit ? (
                <Button
                  type="button"
                  onClick={onSubmit}
                  disabled={submitPending}
                  className="h-11 bg-emerald-700 px-4 font-black text-white hover:bg-emerald-800"
                >
                  {submitPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={onSend}
                disabled={!input.trim() || isLoading}
                aria-label="Send response"
                className="h-11 w-11 shrink-0 bg-[#F5A623] p-0 text-[#07111F] hover:bg-[#F8C45B]"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mx-auto mt-2 max-w-3xl text-[10px] leading-4 text-slate-400">
              Submitted information remains subject to identity, compliance, and operational review.
            </p>
          </div>
        </section>
      </main>
    </NetworkFrame>
  );
}
