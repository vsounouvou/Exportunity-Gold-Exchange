import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { useTenant } from "@/lib/tenant";
import { 
  Truck, MessageSquare, Send, ChevronRight, CheckCircle2, 
  AlertCircle, ArrowLeft, Loader2, Bot, User as UserIcon,
  Car, Shield, CreditCard
} from "lucide-react";
import { Link } from "wouter";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface ApplicationStatus {
  id: number;
  status: string;
  currentStep: number;
  applicationData: Record<string, any>;
  aiScore?: number;
  aiDecision?: string;
  depositAmount?: string;
  insuranceStatus?: string;
}

const APPLICATION_STEPS = [
  { id: 1, title: "Welcome", description: "Introduction to delivery partnership" },
  { id: 2, title: "Personal Info", description: "Your contact details" },
  { id: 3, title: "Vehicle", description: "Your transportation" },
  { id: 4, title: "Experience", description: "Delivery experience" },
  { id: 5, title: "Deposit & Insurance", description: "Security requirements" },
  { id: 6, title: "Review", description: "Submit for approval" },
];

export default function DeliveryApplicationPage() {
  const { toast } = useToast();
  const { user } = useSession();
  const { brand } = useTenant();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [applicationData, setApplicationData] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: existingApplication, isLoading: loadingApplication } = useQuery<ApplicationStatus>({
    queryKey: ['/api/admin/applications/delivery/my-application'],
    enabled: !!user?.id
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!existingApplication) {
      const welcomeMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Welcome to ${brand.name} — Delivery partner application.

This application assistant guides the submission process for delivery access.

Key points:
• Secure delivery for high-value goods
• Requirements depend on route and role
• Supporting documents may be requested

Access is subject to applicable compliance requirements.

To begin: what is your full legal name?`,
        timestamp: new Date()
      };
      setMessages([welcomeMessage]);
    } else if (existingApplication.status !== 'draft') {
      setCurrentStep(6);
    }
  }, [existingApplication]);

  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const response = await apiRequest('/api/admin/applications/delivery/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: userMessage,
          currentStep,
          applicationData,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });
      return response;
    },
    onSuccess: (data) => {
      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.message,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      
      if (data.extractedData) {
        setApplicationData(prev => ({ ...prev, ...data.extractedData }));
      }
      if (data.nextStep && data.nextStep > currentStep) {
        setCurrentStep(data.nextStep);
      }
      setIsLoading(false);
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to get response. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  });

  const submitApplicationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/admin/applications/delivery', {
        method: 'POST',
        body: JSON.stringify({
          applicationData,
          conversationHistory: messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp
          }))
        })
      });
      return response;
    },
    onSuccess: (data) => {
      const submittedMessage: Message = {
        id: crypto.randomUUID(),
        role: "system",
        content: `Application submitted.

Your file is under review. A notification will be sent once a decision is available.

Application ID: #${data.applicationId}
Status: ${data.status}
${data.depositRequired ? `\nSecurity Deposit: $${data.depositAmount} (payable upon approval)` : ''}

${brand.name}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, submittedMessage]);
      setCurrentStep(6);
    },
    onError: () => {
      toast({
        title: "Submission Failed",
        description: "Unable to submit application. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    sendMessageMutation.mutate(input.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getStepStatus = (stepId: number) => {
    if (stepId < currentStep) return "completed";
    if (stepId === currentStep) return "current";
    return "pending";
  };

  if (loadingApplication) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (existingApplication && existingApplication.status !== 'draft') {
    return (
      <div className="min-h-screen bg-gray-950 p-4 pb-20">
        <div className="max-w-2xl mx-auto">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4 text-gray-400">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Marketplace
            </Button>
          </Link>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                {existingApplication.status === 'approved' ? (
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                ) : existingApplication.status === 'rejected' ? (
                  <AlertCircle className="h-8 w-8 text-red-400" />
                ) : (
                  <Truck className="h-8 w-8 text-amber-400" />
                )}
              </div>
              <CardTitle className="text-xl text-white">
                Application {existingApplication.status === 'approved' ? 'Approved' : 
                            existingApplication.status === 'rejected' ? 'Declined' : 
                            'Under Review'}
              </CardTitle>
              <CardDescription>
                {existingApplication.status === 'approved' 
                  ? "Congratulations! You're now a verified delivery partner."
                  : existingApplication.status === 'rejected'
                  ? "Unfortunately, your application was not approved at this time."
                  : "Your application is being reviewed. We'll notify you soon."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Application ID</span>
                <span className="text-white">#{existingApplication.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Status</span>
                <Badge 
                  className={
                    existingApplication.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                    existingApplication.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }
                >
                  {existingApplication.status}
                </Badge>
              </div>
              {existingApplication.depositAmount && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Security Deposit</span>
                  <span className="text-white">${existingApplication.depositAmount}</span>
                </div>
              )}
              {existingApplication.aiScore && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">AI Score</span>
                  <span className="text-white">{existingApplication.aiScore}/100</span>
                </div>
              )}
              {existingApplication.status === 'approved' && (
                <Link href="/delivery/agent">
                  <Button className="w-full h-11 mt-4 bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                    Go to Delivery Dashboard
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-gray-400 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <Badge variant="outline" className="text-amber-400 border-amber-500/30">
              Step {currentStep} of {APPLICATION_STEPS.length}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Truck className="h-5 w-5 text-amber-500" />
            <h1 className="text-lg font-semibold text-white">Delivery Agent Application</h1>
          </div>
          <Progress value={(currentStep / APPLICATION_STEPS.length) * 100} className="h-1" />
        </div>
      </header>

      <div className="hidden md:block border-b border-gray-800 bg-gray-900/30">
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="flex gap-2 overflow-x-auto">
            {APPLICATION_STEPS.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
                    status === 'completed' ? 'bg-green-500/20 text-green-400' :
                    status === 'current' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-gray-800 text-gray-500'
                  }`}
                >
                  {status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                  {step.title}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="max-w-2xl mx-auto space-y-4 pb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role !== 'user' && (
                <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.role === 'system' ? 'bg-green-500/20' : 'bg-amber-500/20'
                }`}>
                  <Bot className={`h-4 w-4 ${
                    message.role === 'system' ? 'text-green-400' : 'text-amber-400'
                  }`} />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-amber-500 text-black'
                    : message.role === 'system'
                    ? 'bg-green-500/10 border border-green-500/30 text-green-100'
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {message.role === 'user' && (
                <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <UserIcon className="h-4 w-4 text-blue-400" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-amber-400" />
              </div>
              <div className="bg-gray-800 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-gray-800 bg-gray-900/50 backdrop-blur-sm p-4 pb-safe">
        <div className="max-w-2xl mx-auto">
          {currentStep >= 5 && Object.keys(applicationData).length >= 4 ? (
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Add more details or submit..."
                className="flex-1 bg-gray-800 border-gray-700 text-white h-11"
                disabled={isLoading}
              />
              <Button
                onClick={() => submitApplicationMutation.mutate()}
                disabled={submitApplicationMutation.isPending}
                className="h-11 bg-green-600 hover:bg-green-700"
              >
                {submitApplicationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>Submit</>
                )}
              </Button>
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="h-11 bg-amber-500 hover:bg-amber-600 text-black"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your response..."
                className="flex-1 bg-gray-800 border-gray-700 text-white h-11"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="h-11 w-11 bg-amber-500 hover:bg-amber-600 text-black p-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
