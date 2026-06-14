import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ListChecks, Loader2, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";

export type ChatWizardOption = { value: string; title: string; description?: string };

export type ChatWizardStep<Answers extends Record<string, any>> =
  | {
      id: string;
      title: string;
      kind: "text" | "textarea";
      field: keyof Answers & string;
      prompt: string | ((answers: Answers) => string);
      placeholder?: string;
      inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
      required?: boolean | ((answers: Answers) => boolean);
      validate?: (value: unknown, answers: Answers) => string | null;
      formatAnswer?: (value: unknown, answers: Answers) => string;
    }
  | {
      id: string;
      title: string;
      kind: "cards";
      field: keyof Answers & string;
      prompt: string | ((answers: Answers) => string);
      options: ChatWizardOption[];
      required?: boolean | ((answers: Answers) => boolean);
      validate?: (value: unknown, answers: Answers) => string | null;
      formatAnswer?: (value: unknown, answers: Answers) => string;
    }
  | {
      id: string;
      title: string;
      kind: "custom";
      prompt: string | ((answers: Answers) => string);
      required?: boolean | ((answers: Answers) => boolean);
      isComplete?: (answers: Answers, fileMeta: Record<string, any>) => boolean;
      render: (args: {
        answers: Answers;
        setAnswer: (field: keyof Answers & string, value: any) => void;
        files: Record<string, File | null>;
        setFile: (key: string, file: File | null) => void;
        fileMeta: Record<string, any>;
        setFileMeta: (key: string, meta: any) => void;
      }) => React.ReactNode;
    }
  | {
      id: string;
      title: string;
      kind: "file";
      fileKey: string;
      prompt: string | ((answers: Answers) => string);
      accept?: string;
      required?: boolean | ((answers: Answers) => boolean);
    }
  | {
      id: string;
      title: string;
      kind: "review";
      prompt: string | ((answers: Answers) => string);
      renderSummary: (answers: Answers, fileMeta: Record<string, any>) => React.ReactNode;
    };

type PersistedState<Answers> = {
  stepId: string;
  answers: Answers;
  fileMeta: Record<string, any>;
};

type Props<Answers extends Record<string, any>> = {
  title: string;
  description?: string;
  storageKey: string;
  initialAnswers: Answers;
  steps: (answers: Answers) => ChatWizardStep<Answers>[];
  onExit?: () => void;
  onSubmit?: (args: { answers: Answers; files: Record<string, File | null> }) => Promise<void> | void;
  submitLabel?: string;
  uiLabels?: {
    step?: (current: number, total: number) => string;
    steps?: string;
    progress?: string;
    saveAndContinueLater?: string;
    application?: string;
    close?: string;
    done?: string;
  };
  className?: string;
};

function isBlank(value: unknown) {
  return value == null || String(value).trim().length === 0;
}

function getPrompt<Answers extends Record<string, any>>(step: ChatWizardStep<Answers>, answers: Answers): string {
  return typeof step.prompt === "function" ? step.prompt(answers) : step.prompt;
}

function stepRequired<Answers extends Record<string, any>>(step: ChatWizardStep<Answers>, answers: Answers): boolean {
  if ("kind" in step && step.kind === "review") return false;
  const raw = (step as any).required;
  if (typeof raw === "function") return !!raw(answers);
  if (raw === false) return false;
  return true;
}

export function ChatFormWizard<Answers extends Record<string, any>>(props: Props<Answers>) {
  const { toast } = useToast();
  const { t } = useLocale();
  const labels = props.uiLabels || {};
  const [answers, setAnswers] = useState<Answers>(props.initialAnswers);
  const [stepId, setStepId] = useState<string>("");
  const [fileMeta, setFileMetaState] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const steps = useMemo(() => props.steps(answers), [props, answers]);

  useEffect(() => {
    const raw = localStorage.getItem(props.storageKey);
    if (!raw) {
      setStepId(steps[0]?.id || "");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PersistedState<Answers>;
      if (parsed?.answers) setAnswers({ ...props.initialAnswers, ...parsed.answers });
      if (parsed?.fileMeta) setFileMetaState(parsed.fileMeta);
      setStepId(parsed?.stepId || steps[0]?.id || "");
    } catch {
      setStepId(steps[0]?.id || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.storageKey]);

  useEffect(() => {
    if (!steps.length) return;
    if (!stepId || !steps.some((s) => s.id === stepId)) {
      setStepId(steps[0].id);
    }
  }, [steps, stepId]);

  useEffect(() => {
    if (!stepId) return;
    const state: PersistedState<Answers> = { stepId, answers, fileMeta };
    localStorage.setItem(props.storageKey, JSON.stringify(state));
  }, [answers, fileMeta, props.storageKey, stepId]);

  const currentIndex = Math.max(0, steps.findIndex((s) => s.id === stepId));
  const current = steps[currentIndex] || steps[0];

  const setAnswer = (field: keyof Answers & string, value: any) => {
    setAnswers((prev) => ({ ...prev, [field]: value }));
  };

  const setFileMeta = (key: string, meta: any) => {
    setFileMetaState((prev) => ({ ...prev, [key]: meta }));
  };

  const onSetFile = (key: string, file: File | null) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
    if (file) {
      setFileMeta(key, { name: file.name, size: file.size, type: file.type, updatedAt: new Date().toISOString() });
    } else {
      setFileMeta(key, null);
    }
  };

  const completedCount = useMemo(() => {
    return steps.filter((s) => {
      if (s.kind === "review") return false;
      if (s.kind === "file") return !!files[s.fileKey] || !!fileMeta[s.fileKey];
      if (s.kind === "custom") return s.isComplete ? s.isComplete(answers, fileMeta) : true;
      if (s.kind === "cards" || s.kind === "text" || s.kind === "textarea") return !isBlank(answers[s.field]);
      return false;
    }).length;
  }, [answers, fileMeta, files, steps]);

  const progress = steps.length ? Math.round((completedCount / Math.max(1, steps.length - 1)) * 100) : 0;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentIndex, stepId]);

  const validateStep = (step: ChatWizardStep<Answers>): string | null => {
    if (step.kind === "review") return null;

    if (step.kind === "file") {
      const required = stepRequired(step, answers);
      if (!required) return null;
      const hasFile = !!files[step.fileKey];
      if (!hasFile) return t("wizard.error.uploadRequired");
      return null;
    }

    if (step.kind === "custom") {
      const required = stepRequired(step, answers);
      if (!required) return null;
      if (step.isComplete && !step.isComplete(answers, fileMeta)) return t("wizard.error.completeStep");
      return null;
    }

    const required = stepRequired(step, answers);
    const value = answers[step.field];
    if (required && isBlank(value)) return t("wizard.error.answerToContinue");
    if (step.validate) return step.validate(value, answers);
    return null;
  };

  const goBack = () => {
    const prev = steps[currentIndex - 1];
    if (prev) setStepId(prev.id);
  };

  const goNext = () => {
    if (!current) return;
    const err = validateStep(current);
    if (err) {
      toast({ title: t("wizard.toast.checkStepTitle"), description: err, variant: "destructive" });
      return;
    }
    const next = steps[currentIndex + 1];
    if (next) setStepId(next.id);
  };

  const doSubmit = async () => {
    if (!props.onSubmit) return;
    setSubmitting(true);
    try {
      await props.onSubmit({ answers, files });
      toast({ title: t("wizard.toast.submittedTitle"), description: t("wizard.toast.submittedDescription") });
      localStorage.removeItem(props.storageKey);
    } catch (err: any) {
      toast({ title: t("wizard.toast.submitFailedTitle"), description: String(err?.message || err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const renderMessages = () => {
    const messages: Array<{ role: "assistant" | "user"; content: React.ReactNode; key: string }> = [];

    messages.push({
      role: "assistant",
      key: "intro",
      content: (
        <div>
          <p className="font-semibold text-white">{props.title}</p>
          {props.description ? <p className="mt-1 text-[12px] text-white/60">{props.description}</p> : null}
        </div>
      ),
    });

    for (let i = 0; i <= currentIndex; i++) {
      const s = steps[i];
      if (!s) continue;

      messages.push({
        role: "assistant",
        key: `a-${s.id}`,
        content: <p className="text-white/90">{getPrompt(s, answers)}</p>,
      });

      if (i >= currentIndex) break;

      if (s.kind === "file") {
        const meta = fileMeta[s.fileKey];
        messages.push({
          role: "user",
          key: `u-${s.id}`,
          content: <p className="text-white/90">{meta?.name ? `${t("wizard.label.uploadedPrefix")} ${meta.name}` : "—"}</p>,
        });
        continue;
      }

      if (s.kind === "review") continue;

      if (s.kind === "custom") {
        messages.push({
          role: "user",
          key: `u-${s.id}`,
          content: <p className="text-white/70">{labels.done || t("wizard.label.done")}</p>,
        });
        continue;
      }

      const val = answers[s.field];
      const text = s.formatAnswer ? s.formatAnswer(val, answers) : String(val ?? "");
      messages.push({
        role: "user",
        key: `u-${s.id}`,
        content: <p className="text-white/90">{text || "—"}</p>,
      });
    }

    if (current?.kind === "review") {
      messages.push({
        role: "assistant",
        key: `a-review`,
        content: (
          <div className="space-y-2">
            <p className="text-white/90">{getPrompt(current, answers)}</p>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">{current.renderSummary(answers, fileMeta)}</div>
          </div>
        ),
      });
    }

    return (
      <div className="space-y-3">
        {messages.map((m) => (
          <div
            key={m.key}
            className={cn(
              "max-w-[92%] rounded-2xl px-3 py-2 text-sm border",
              m.role === "assistant"
                ? "bg-white/5 border-white/10 text-white/80"
                : "bg-amber-500/15 border-amber-500/30 ml-auto",
            )}
          >
            {m.content}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
    );
  };

  const renderInput = () => {
    if (!current) return null;
    if (current.kind === "review") {
      return (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            className="border-white/15 text-white/80 hover:bg-white/10"
            onClick={goBack}
            disabled={submitting}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t("common.back")}
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={doSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("common.submitting")}
              </>
            ) : (
              props.submitLabel || t("common.submit")
            )}
          </Button>
        </div>
      );
    }

    if (current.kind === "cards") {
      const selected = answers[current.field];
      const required = stepRequired(current, answers);
      const canSkip = !required;

      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {current.options.map((opt) => (
               <button
                 key={opt.value}
                 type="button"
                 className={cn(
                   "rounded-xl border p-3 text-left transition-colors",
                   selected === opt.value ? "border-amber-500/40 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                 )}
                 onClick={() => {
                  const nextAnswers = { ...answers, [current.field]: opt.value } as Answers;
                  setAnswer(current.field, opt.value);

                  // Compute next step using the updated answers (some selections change the step list).
                  const nextSteps = props.steps(nextAnswers);
                  const idx = Math.max(0, nextSteps.findIndex((s) => s.id === current.id));
                  const next = nextSteps[idx + 1];
                  if (next) setStepId(next.id);
                 }}
               >
                 <div className="flex items-center justify-between gap-2">
                   <p className="text-sm font-semibold text-white">{opt.title}</p>
                   {selected === opt.value ? <CheckCircle2 className="h-4 w-4 text-amber-300" /> : null}
                </div>
                {opt.description ? <p className="mt-1 text-[12px] text-white/60">{opt.description}</p> : null}
              </button>
            ))}
          </div>
          {required && isBlank(selected) ? (
            <p className="text-[12px] text-white/60">{t("wizard.error.selectOptionToContinue")}</p>
          ) : null}
          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
              onClick={goBack}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("common.back")}
            </Button>
            {canSkip ? (
              <Button
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => {
                  setAnswer(current.field, "");
                  goNext();
                }}
              >
                {t("common.skip")}
              </Button>
            ) : (
              <div />
            )}
          </div>
        </div>
      );
    }

    if (current.kind === "file") {
      const required = stepRequired(current, answers);
      const file = files[current.fileKey];
      const meta = fileMeta[current.fileKey];
      const hasFile = !!file;

      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{meta?.name || (hasFile ? file?.name : t("common.noFileSelected"))}</p>
              <p className="text-[11px] text-white/60">
                {required ? t("common.required") : t("common.optional")}
                {meta?.updatedAt ? ` • ${t("common.updated")} ${String(meta.updatedAt).slice(0, 10)}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="file"
                accept={current.accept}
                className="hidden"
                id={`${props.storageKey}-${current.fileKey}`}
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0] || null;
                  onSetFile(current.fileKey, f);
                }}
              />
              <label htmlFor={`${props.storageKey}-${current.fileKey}`}>
                <Button asChild variant="outline" className="border-white/15 text-white/80 hover:bg-white/10">
                  <span>{t("common.selectLabel")}</span>
                </Button>
              </label>
              {hasFile ? (
                <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10" onClick={() => onSetFile(current.fileKey, null)}>
                  {t("common.remove")}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10" onClick={goBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("common.back")}
            </Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={goNext}>
              {t("common.continue")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
          {required && meta && !files[current.fileKey] ? (
            <p className="text-[12px] text-amber-200/80">
              {t("wizard.file.reuploadWarning")}
            </p>
          ) : null}
        </div>
      );
    }

    if (current.kind === "custom") {
      return (
        <div className="space-y-3">
          {current.render({ answers, setAnswer, files, setFile: onSetFile, fileMeta, setFileMeta })}
          <div className="flex justify-between gap-2">
            <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10" onClick={goBack}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("common.back")}
            </Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={goNext}>
              {t("common.continue")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      );
    }

    const value = answers[current.field] ?? "";
    const required = stepRequired(current, answers);
    const canSkip = !required;

    return (
      <div className="space-y-3">
        {current.kind === "textarea" ? (
          <Textarea
            value={String(value)}
            onChange={(e) => setAnswer(current.field, e.target.value)}
            placeholder={current.placeholder}
            className="bg-black/30 border-white/10 text-white placeholder:text-white/40 min-h-[88px]"
          />
        ) : (
          <Input
            value={String(value)}
            onChange={(e) => setAnswer(current.field, e.target.value)}
            placeholder={current.placeholder}
            inputMode={current.inputMode}
            className="bg-black/30 border-white/10 text-white placeholder:text-white/40"
          />
        )}

        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            className="border-white/15 text-white/80 hover:bg-white/10"
            onClick={goBack}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t("common.back")}
          </Button>
          <div className="flex gap-2">
            {canSkip ? (
              <Button
                variant="outline"
                className="border-white/15 text-white/80 hover:bg-white/10"
                onClick={() => {
                  setAnswer(current.field, "");
                  goNext();
                }}
              >
                {t("common.skip")}
              </Button>
            ) : null}
            <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={goNext}>
              {t("common.continue")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const StepList = () => (
    <div className="space-y-2">
      <p className="text-[11px] text-white/60 uppercase tracking-wider flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-white/40" />
        {labels.steps || "Steps"}
      </p>
      <div className="space-y-1">
        {steps
          .filter((s) => s.kind !== "review")
          .map((s, idx) => {
            const isCurrent = idx === currentIndex;
            const done =
              s.kind === "file"
                ? !!files[s.fileKey] || !!fileMeta[s.fileKey]
                : s.kind === "custom"
                  ? s.isComplete
                    ? s.isComplete(answers, fileMeta)
                    : true
                  : "field" in s
                    ? !isBlank(answers[(s as any).field])
                    : false;

            return (
              <button
                key={s.id}
                type="button"
                className={cn(
                  "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                  isCurrent ? "border-amber-500/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
                onClick={() => setStepId(s.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white truncate">{s.title}</p>
                  {done ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : null}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );

  return (
    <div className={cn("w-full", props.className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-white/60">
            {labels.step ? labels.step(Math.min(currentIndex + 1, steps.length), steps.length) : `Step ${Math.min(currentIndex + 1, steps.length)} of ${steps.length}`}
          </p>
          <Progress value={Math.max(0, Math.min(100, progress))} className="h-2 mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="border-white/15 text-white/80 hover:bg-white/10 md:hidden">
                <ListChecks className="h-4 w-4 mr-2" />
                {labels.steps || "Steps"}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="bg-gray-950 border-white/10 text-white">
              <SheetHeader>
                <SheetTitle className="text-white">{labels.progress || "Progress"}</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <StepList />
              </div>
            </SheetContent>
          </Sheet>
          {props.onExit ? (
            <Button
              variant="outline"
              className="border-white/15 text-white/80 hover:bg-white/10"
              onClick={() => {
                localStorage.setItem(props.storageKey, JSON.stringify({ stepId, answers, fileMeta }));
                props.onExit?.();
              }}
            >
              <Save className="h-4 w-4 mr-2" />
              {labels.saveAndContinueLater || "Save & continue later"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
        <Card className="bg-gray-900/60 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white">{current?.title || labels.application || "Application"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-[340px] pr-3">{renderMessages()}</ScrollArea>
            {renderInput()}
            {props.onExit ? (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  className="text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => props.onExit?.()}
                >
                  {labels.close || "Close"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="hidden md:block">
          <Card className="bg-gray-900/60 border-white/10">
            <CardContent className="pt-6">
              <StepList />
              <div className="mt-4 flex items-center justify-between gap-2">
                <Badge className="bg-white/5 border-white/10 text-white/70">{completedCount} done</Badge>
                {props.onExit ? (
                  <Button
                    variant="outline"
                    className="border-white/15 text-white/80 hover:bg-white/10"
                    onClick={() => props.onExit?.()}
                  >
                    {labels.close || "Close"}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
