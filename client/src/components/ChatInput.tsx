import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, MicOff, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MessageType } from "@db/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChatInputProps {
  onSend: (message: string, type: MessageType) => void;
  isLoading?: boolean;
  placeholder?: string;
  defaultLanguage?: string;
  messageType?: MessageType;
  onMessageTypeChange?: (type: MessageType) => void;
}

export function ChatInput({ 
  onSend, 
  isLoading, 
  placeholder = "Type a message...",
  defaultLanguage = "en-US",
  messageType = "chat",
  onMessageTypeChange 
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(defaultLanguage);
  const [audioLevel, setAudioLevel] = useState(0);
  const { toast } = useToast();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Initialize audio context for visualization
  useEffect(() => {
    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;

    return () => {
      if (audioContextRef.current?.state === 'running') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Initialize speech recognition
  const initializeSpeechRecognition = () => {
    const SpeechRecognitionCtor: (new () => SpeechRecognition) | null =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;

    if (!SpeechRecognitionCtor) {
      toast({
        title: "Voice Input Not Supported",
        description: "Your browser doesn't support voice input. Please use a modern browser.",
        variant: "destructive",
      });
      return null;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = selectedLanguage;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');

      setMessage(prev => {
        const newMessage = transcript.trim();
        return newMessage !== prev ? newMessage : prev;
      });
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      stopListening();
      toast({
        title: "Voice Input Error",
        description: `Error: ${event.error}. Please try again.`,
        variant: "destructive",
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      stopAudioVisualization();
    };

    return recognition;
  };

  const startAudioVisualization = async () => {
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContextRef.current!.createMediaStreamSource(mediaStreamRef.current);
      source.connect(analyserRef.current!);

      const dataArray = new Uint8Array(analyserRef.current!.frequencyBinCount);

      const updateLevel = () => {
        if (!isListening) return;

        analyserRef.current!.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
        setAudioLevel(average / 255); // Normalize to 0-1

        requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopAudioVisualization = () => {
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    setAudioLevel(0);
  };

  const startListening = async () => {
    if (!recognitionRef.current) {
      recognitionRef.current = initializeSpeechRecognition();
    }

    if (recognitionRef.current) {
      try {
        await startAudioVisualization();
        recognitionRef.current.start();
        setIsListening(true);
        toast({
          title: "Voice Input Active",
          description: "Speak now. The input will automatically stop after a pause.",
        });
      } catch (error) {
        console.error('Error starting voice input:', error);
        toast({
          title: "Voice Input Error",
          description: "Failed to start voice input. Please check your microphone permissions.",
          variant: "destructive",
        });
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      stopAudioVisualization();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (message.trim()) {
      onSend(message.trim(), messageType);
      setMessage("");
      if (isListening) {
        stopListening();
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <form 
        onSubmit={handleSubmit} 
        className="mx-auto max-w-4xl flex flex-col gap-2 p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-lg"
      >
        <div className="flex gap-2">
          {/* Message type selector - Always visible */}
          <Select 
            value={messageType}
            onValueChange={(value) => onMessageTypeChange?.(value as MessageType)}
          >
            <SelectTrigger className="w-[140px] shrink-0">
              <SelectValue placeholder="Message type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="task_update">Task Update</SelectItem>
              <SelectItem value="announcement">Announcement</SelectItem>
              <SelectItem value="reflection">Reflection</SelectItem>
              <SelectItem value="decision">Decision</SelectItem>
            </SelectContent>
          </Select>

          {/* Language selector - Collapsible */}
          <div className="flex-shrink-0">
            <Select
              value={selectedLanguage}
              onValueChange={setSelectedLanguage}
              disabled={isListening || isLoading}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="en-GB">English (UK)</SelectItem>
                <SelectItem value="es-ES">Spanish</SelectItem>
                <SelectItem value="fr-FR">French</SelectItem>
                <SelectItem value="de-DE">German</SelectItem>
                <SelectItem value="it-IT">Italian</SelectItem>
                <SelectItem value="pt-BR">Portuguese</SelectItem>
                <SelectItem value="ru-RU">Russian</SelectItem>
                <SelectItem value="ja-JP">Japanese</SelectItem>
                <SelectItem value="ko-KR">Korean</SelectItem>
                <SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Input area */}
        <div className="flex items-center gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1"
          />

          {/* Voice input button with audio level indicator */}
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isLoading}
              onClick={isListening ? stopListening : startListening}
              className="flex-shrink-0 relative"
            >
              {isListening ? (
                <>
                  <MicOff className="h-4 w-4 text-red-500" />
                  <span 
                    className="absolute inset-0 rounded-full bg-red-500/20 animate-pulse"
                    style={{ 
                      transform: `scale(${1 + audioLevel * 0.5})`,
                      opacity: 0.5 - audioLevel * 0.3
                    }}
                  />
                </>
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Send button */}
          <Button
            type="submit"
            disabled={isLoading || !message.trim()}
            className="flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Recording status */}
        {isListening && (
          <p className="text-xs text-muted-foreground animate-pulse">
            Listening... Speak now
          </p>
        )}
      </form>
    </div>
  );
}

export default ChatInput;
