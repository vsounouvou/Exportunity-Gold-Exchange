import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Volume2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VoiceCommandProps {
  onCommandExecuted?: (command: string) => void;
  onCreateMeeting?: () => void;
  onCreateTask?: (description: string) => void;
  onCreateAgent?: () => void;
  onSendToChat?: (message: string) => void;
}

export function VoiceCommand({ onCommandExecuted, onCreateMeeting, onCreateTask, onCreateAgent, onSendToChat }: VoiceCommandProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const clearTranscriptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Check if browser supports Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setIsSupported(true);
      
      // Initialize speech recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsListening(true);
        toast({
          title: "Listening...",
          description: "Speak your command now. Release button when done.",
        });
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }
        
        setInterimTranscript(interim);
        
        if (final) {
          setTranscript(final);
          
          // If onSendToChat is provided, send to chat instead of processing locally
          if (onSendToChat) {
            onSendToChat(final);
            toast({
              title: "Voice message sent",
              description: "Your message has been sent to the Assistant",
            });
          } else {
            processCommand(final);
          }
          
          // Auto-clear transcript after 2 seconds
          if (clearTranscriptTimeoutRef.current) {
            clearTimeout(clearTranscriptTimeoutRef.current);
          }
          clearTranscriptTimeoutRef.current = setTimeout(() => {
            setTranscript("");
            setInterimTranscript("");
          }, 2000);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        toast({
          title: "Voice Command Error",
          description: `Error: ${event.error}`,
          variant: "destructive",
        });
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (clearTranscriptTimeoutRef.current) {
        clearTimeout(clearTranscriptTimeoutRef.current);
      }
    };
  }, []);

  const processCommand = (command: string) => {
    const lowerCommand = command.toLowerCase().trim();
    
    // Navigation commands
    if (lowerCommand.includes('go to') || lowerCommand.includes('open') || lowerCommand.includes('show')) {
      if (lowerCommand.includes('home') || lowerCommand.includes('dashboard')) {
        setLocation('/');
        toast({ title: "Navigating to Home" });
        onCommandExecuted?.(command);
        return;
      }
      
      if (lowerCommand.includes('meeting')) {
        setLocation('/meetings');
        toast({ title: "Navigating to Meetings" });
        onCommandExecuted?.(command);
        return;
      }
      
      if (lowerCommand.includes('agent') || lowerCommand.includes('hierarchy')) {
        setLocation('/hierarchy');
        toast({ title: "Navigating to Agents & Hierarchy" });
        onCommandExecuted?.(command);
        return;
      }
      
      if (lowerCommand.includes('knowledge') || lowerCommand.includes('document')) {
        setLocation('/knowledge');
        toast({ title: "Navigating to Knowledge Base" });
        onCommandExecuted?.(command);
        return;
      }
      
      if (lowerCommand.includes('action')) {
        setLocation('/actions');
        toast({ title: "Navigating to Actions" });
        onCommandExecuted?.(command);
        return;
      }
      
      if (lowerCommand.includes('performance') || lowerCommand.includes('diagnostic')) {
        setLocation('/diagnostics');
        toast({ title: "Navigating to Performance & Diagnostics" });
        onCommandExecuted?.(command);
        return;
      }
    }
    
    // Task assignment commands
    if (lowerCommand.includes('create') || lowerCommand.includes('new') || lowerCommand.includes('schedule')) {
      if (lowerCommand.includes('meeting')) {
        if (onCreateMeeting) {
          onCreateMeeting();
          toast({
            title: "Voice Command",
            description: "Opening meeting creation dialog...",
          });
        } else {
          setLocation('/meetings');
          toast({
            title: "Voice Command",
            description: "Navigate to Meetings page to create a meeting",
          });
        }
        onCommandExecuted?.(command);
        return;
      }
      
      if (lowerCommand.includes('task')) {
        // Extract task description if provided
        const taskMatch = lowerCommand.match(/(?:create|new)\s+task\s+(.+)/);
        const taskDescription = taskMatch ? taskMatch[1] : '';
        
        if (onCreateTask) {
          onCreateTask(taskDescription);
          toast({
            title: "Voice Command",
            description: taskDescription ? `Creating task: "${taskDescription}"` : "Opening task creation dialog...",
          });
        } else {
          toast({
            title: "Voice Command",
            description: "Task creation will be available soon",
            variant: "default",
          });
        }
        onCommandExecuted?.(command);
        return;
      }
      
      if (lowerCommand.includes('agent')) {
        if (onCreateAgent) {
          onCreateAgent();
          toast({
            title: "Voice Command",
            description: "Opening agent creation dialog...",
          });
        } else {
          setLocation('/hierarchy');
          toast({
            title: "Voice Command",
            description: "Navigate to Hierarchy page to create an agent",
          });
        }
        onCommandExecuted?.(command);
        return;
      }
    }
    
    // General commands
    if (lowerCommand.includes('help') || lowerCommand.includes('what can you do') || lowerCommand.includes('commands')) {
      toast({
        title: "Voice Commands Available",
        description: "Navigation: 'Go to [meetings/home/actions/knowledge/hierarchy]' • Creation: 'Create [meeting/task/agent]' • Say 'help' anytime",
        duration: 7000,
      });
      onCommandExecuted?.(command);
      return;
    }
    
    // If no command matched
    toast({
      title: "Command Not Recognized",
      description: `"${command}" - Try saying 'help' for available commands`,
      variant: "destructive",
    });
  };

  const startListening = () => {
    if (!recognitionRef.current || isListening) return;
    
    try {
      recognitionRef.current.start();
    } catch (error: any) {
      console.error('Failed to start voice recognition:', error);
      toast({
        title: "Microphone Access Required",
        description: "Please allow microphone access to use voice commands.",
        variant: "destructive",
      });
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current || !isListening) return;
    
    recognitionRef.current.stop();
    
    // Clear transcript immediately on mobile for cleaner UX
    if (clearTranscriptTimeoutRef.current) {
      clearTimeout(clearTranscriptTimeoutRef.current);
    }
    clearTranscriptTimeoutRef.current = setTimeout(() => {
      setTranscript("");
      setInterimTranscript("");
    }, 1500);
  };

  if (!isSupported) {
    return (
      <div className="fixed bottom-28 right-6 z-40">
        <div className="relative group">
          <Button
            size="lg"
            disabled
            className="h-14 w-14 rounded-full shadow-lg bg-gray-700 cursor-not-allowed"
          >
            <MicOff className="h-6 w-6 text-gray-400" />
          </Button>
          
          {/* Tooltip for unsupported browsers */}
          <Card className="absolute bottom-16 right-0 w-80 bg-gray-900 border-gray-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-medium text-white">Voice Commands Unavailable</span>
              </div>
              <p className="text-xs text-gray-400">
                Your browser doesn't support Web Speech API. Try Chrome, Edge, or Safari for voice control.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-28 right-6 z-40">
      <div className="relative group">
        {/* Voice button - Press and hold to speak */}
        <Button
          size="lg"
          onMouseDown={startListening}
          onMouseUp={stopListening}
          onMouseLeave={stopListening}
          onTouchStart={startListening}
          onTouchEnd={stopListening}
          className={cn(
            "h-14 w-14 rounded-full shadow-lg transition-all select-none",
            isListening 
              ? "bg-red-600 hover:bg-red-700 animate-pulse" 
              : "bg-blue-600 hover:bg-blue-700"
          )}
        >
          {isListening ? (
            <Mic className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </Button>

        {/* Hint tooltip */}
        {!isListening && (
          <div className="absolute -top-10 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <Badge className="bg-blue-600 text-white border-blue-500 whitespace-nowrap">
              Hold to speak
            </Badge>
          </div>
        )}

        {/* Listening indicator */}
        {isListening && (
          <div className="absolute -top-2 -right-2">
            <div className="relative">
              <div className="h-4 w-4 bg-red-500 rounded-full animate-ping absolute"></div>
              <div className="h-4 w-4 bg-red-500 rounded-full"></div>
            </div>
          </div>
        )}

        {/* Transcript display */}
        {(transcript || interimTranscript) && (
          <Card className="absolute bottom-16 right-0 w-80 bg-gray-900 border-gray-800 shadow-xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-white">Voice Input</span>
                {isListening && (
                  <Badge variant="outline" className="ml-auto text-red-400 border-red-400">
                    Listening...
                  </Badge>
                )}
              </div>
              
              {transcript && (
                <p className="text-sm text-white mb-1">
                  <span className="text-green-400">✓</span> {transcript}
                </p>
              )}
              
              {interimTranscript && (
                <p className="text-sm text-gray-400 italic">
                  {interimTranscript}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
