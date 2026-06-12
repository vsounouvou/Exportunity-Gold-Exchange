import type { ChangeEvent, KeyboardEvent } from "react";
import { Camera, Mic, Plus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type AssistantQuickFlowId } from "@/lib/assistantQuickFlows";

type ExportunityAssistantBarProps = {
  isMobile: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onOpen: () => void;
  onQuickFlow: (flowId: AssistantQuickFlowId) => void;
};

export function ExportunityAssistantBar({
  isMobile,
  inputValue,
  onInputChange,
  onSubmit,
  onOpen,
}: ExportunityAssistantBarProps) {
  const sharedInputProps = {
    value: inputValue,
    onChange: (event: ChangeEvent<HTMLInputElement>) => onInputChange(event.target.value),
    onFocus: onOpen,
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onSubmit();
      }
    },
  };

  if (isMobile) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--layer-concierge)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)]">
        <div className="pointer-events-auto rounded-[28px] border border-[#E2A416]/90 bg-[#03101b]/92 p-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.42),0_0_26px_rgba(226,164,22,0.18)] backdrop-blur-2xl">
          <div className="flex min-h-[74px] items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-colors hover:bg-white/14"
              aria-label="Add attachment"
            >
              <Plus className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1 px-1">
              <input
                {...sharedInputProps}
                placeholder="Talk to Tassi or snap a product..."
                className="h-12 w-full rounded-full border-0 bg-transparent px-2 text-base text-white outline-none placeholder:text-white/55 focus:ring-0"
              />
            </div>
            <button
              type="button"
              onClick={onOpen}
              className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-colors hover:bg-white/14 min-[390px]:flex"
              aria-label="Take a photo"
            >
              <Camera className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E2A416]/40 bg-[#E2A416]/12 text-[#E2A416] shadow-[0_0_24px_rgba(226,164,22,0.24)] transition-colors hover:bg-[#E2A416]/18"
              aria-label="Use voice"
            >
              <Mic className="h-5 w-5" />
            </button>
            <Button
              type="button"
              className="h-12 w-12 shrink-0 rounded-full bg-[#E2A416] p-0 text-[#07121F] shadow-[0_0_24px_rgba(226,164,22,0.36)] hover:bg-[#f4b321]"
              onClick={onSubmit}
              aria-label="Ask Tassi"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[var(--layer-concierge)] hidden px-5 xl:block">
      <div className="pointer-events-auto mx-auto flex max-w-5xl items-center gap-3 rounded-[34px] border border-[#E2A416]/80 bg-[#03101b]/92 p-3 shadow-[0_26px_80px_rgba(0,0,0,0.42),0_0_28px_rgba(226,164,22,0.14)] backdrop-blur-2xl">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-colors hover:bg-white/14"
          aria-label="Add attachment"
        >
          <Plus className="h-7 w-7" />
        </button>
        <div className="min-w-[280px] flex-1">
          <input
            {...sharedInputProps}
            placeholder="Ask Tassi anything around you..."
            className="h-14 w-full rounded-full border-0 bg-transparent px-3 text-lg text-white outline-none placeholder:text-white/48 focus:ring-0"
          />
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-colors hover:bg-white/14"
          aria-label="Take a photo"
        >
          <Camera className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/8 text-white transition-colors hover:bg-white/14"
          aria-label="Use voice"
        >
          <Mic className="h-5 w-5" />
        </button>
        <Button
          type="button"
          className="h-14 w-14 shrink-0 rounded-full bg-[#E2A416] p-0 text-[#07121F] shadow-[0_0_28px_rgba(226,164,22,0.36)] hover:bg-[#f4b321]"
          onClick={onSubmit}
          aria-label="Ask Tassi"
        >
          <Send className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
