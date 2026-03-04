import { VoiceToTextButton } from "@/components/chat/VoiceToTextButton";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  isDisabled?: boolean;
}

export function VoiceInput({ onTranscript, isDisabled }: VoiceInputProps) {
  return (
    <VoiceToTextButton
      disabled={isDisabled}
      draftText=""
      setDraftText={(text) => onTranscript(String(text || "").trim())}
      appendDraftText={(text) => onTranscript(String(text || "").trim())}
      autoSendAfterTranscription={false}
    />
  );
}

