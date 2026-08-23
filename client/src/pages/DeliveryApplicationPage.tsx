import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";

import {
  ExportunityApplicationConversation,
  ExportunityApplicationLoading,
  ExportunityApplicationStatus,
  type ExportunityApplicationMessage,
  type ExportunityApplicationStep,
} from "@/components/exportunity/ExportunityApplicationShell";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/lib/session";

interface ApplicationStatus {
  id: number;
  status: string;
  depositAmount?: string;
}

const APPLICATION_STEPS: ExportunityApplicationStep[] = [
  { id: 1, title: "Welcome", description: "Understand delivery access" },
  { id: 2, title: "Identity", description: "Confirm contact details" },
  { id: 3, title: "Vehicle", description: "Describe transport capacity" },
  { id: 4, title: "Experience", description: "Share operating history" },
  { id: 5, title: "Risk controls", description: "Review evidence requirements" },
  { id: 6, title: "Review", description: "Submit for human review" },
];

export default function DeliveryApplicationPage() {
  const { toast } = useToast();
  const { user } = useSession();
  const [messages, setMessages] = useState<ExportunityApplicationMessage[]>([]);
  const [input, setInput] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [applicationData, setApplicationData] = useState<Record<string, unknown>>({});

  const { data: existingApplication, isLoading: loadingApplication } = useQuery<ApplicationStatus>({
    queryKey: ["/api/admin/applications/delivery/my-application"],
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (!existingApplication) {
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Welcome to Exportunity — delivery network access.

This application desk will collect the identity, vehicle, route, experience, and supporting information required to assess delivery access.

Coverage, insurance, deposit, and evidence requirements depend on the approved service and route. No partnership or assignment is confirmed until review is complete.

To begin: what is your full legal name?`,
          timestamp: new Date(),
        },
      ]);
    } else if (existingApplication.status !== "draft") {
      setCurrentStep(6);
    }
  }, [existingApplication]);

  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) =>
      apiRequest("/api/admin/applications/delivery/chat", {
        method: "POST",
        body: JSON.stringify({
          message: userMessage,
          currentStep,
          applicationData,
          conversationHistory: messages.slice(-10).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      }),
    onSuccess: (data) => {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.message,
          timestamp: new Date(),
        },
      ]);
      if (data.extractedData) {
        setApplicationData((current) => ({ ...current, ...data.extractedData }));
      }
      if (data.nextStep && data.nextStep > currentStep) {
        setCurrentStep(data.nextStep);
      }
      setIsLoading(false);
    },
    onError: () => {
      toast({
        title: "Unable to continue",
        description: "The application desk could not process that response. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    },
  });

  const submitApplicationMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/admin/applications/delivery", {
        method: "POST",
        body: JSON.stringify({
          applicationData,
          conversationHistory: messages.map((message) => ({
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
          })),
        }),
      }),
    onSuccess: (data) => {
      const depositNotice = data.depositRequired
        ? `\nSecurity requirement: $${data.depositAmount} (only after approval and formal instructions)`
        : "";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `Application submitted.

Your file is now under review. Exportunity will notify you when a decision or request for evidence is available.

Application ID: #${data.applicationId}
Status: ${data.status}${depositNotice}`,
          timestamp: new Date(),
        },
      ]);
      setCurrentStep(6);
    },
    onError: () => {
      toast({
        title: "Submission failed",
        description: "Your application could not be submitted. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    const value = input.trim();
    if (!value || isLoading) return;
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: value,
        timestamp: new Date(),
      },
    ]);
    setInput("");
    setIsLoading(true);
    sendMessageMutation.mutate(value);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  if (loadingApplication) {
    return <ExportunityApplicationLoading testId="exportunity-delivery-application-loading" />;
  }

  if (existingApplication && existingApplication.status !== "draft") {
    const metrics = existingApplication.depositAmount
      ? [
          {
            label: "Security requirement",
            value: `$${existingApplication.depositAmount} after approval`,
          },
        ]
      : [];
    return (
      <ExportunityApplicationStatus
        testId="exportunity-delivery-application-status"
        icon={Truck}
        status={existingApplication.status}
        applicationId={existingApplication.id}
        approvedTitle="Delivery access approved"
        approvedDescription="You can now continue into the governed delivery workspace. Assignments remain subject to route, capacity, evidence, and risk controls."
        rejectedDescription="This application was not approved in its current form. Exportunity will contact you if another review path is available."
        reviewDescription="Your identity and operating information are being reviewed. We will notify you if supporting evidence or clarification is required."
        metrics={metrics}
        approvedAction={{ href: "/delivery/agent", label: "Open delivery workspace" }}
        backLabel="Back to network"
      />
    );
  }

  return (
    <ExportunityApplicationConversation
      testId="exportunity-delivery-application"
      title="Delivery network application"
      description="Apply to provide verified delivery capacity through the Exportunity Global Trade Network."
      icon={Truck}
      steps={APPLICATION_STEPS}
      currentStep={currentStep}
      messages={messages}
      isLoading={isLoading}
      input={input}
      onInputChange={setInput}
      onInputKeyDown={handleInputKeyDown}
      onSend={handleSend}
      canSubmit={currentStep >= 5 && Object.keys(applicationData).length >= 4}
      onSubmit={() => submitApplicationMutation.mutate()}
      submitPending={submitApplicationMutation.isPending}
      backLabel="Back to network"
    />
  );
}
