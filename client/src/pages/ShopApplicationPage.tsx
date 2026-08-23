import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";

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
}

const APPLICATION_STEPS: ExportunityApplicationStep[] = [
  { id: 1, title: "Welcome", description: "Understand seller access" },
  { id: 2, title: "Business", description: "Describe your company" },
  { id: 3, title: "Products", description: "Define your offer" },
  { id: 4, title: "Experience", description: "Share your trading history" },
  { id: 5, title: "Verification", description: "Provide supporting evidence" },
  { id: 6, title: "Review", description: "Submit for human review" },
];

export default function ShopApplicationPage() {
  const { toast } = useToast();
  const { user } = useSession();
  const [messages, setMessages] = useState<ExportunityApplicationMessage[]>([]);
  const [input, setInput] = useState("");
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [applicationData, setApplicationData] = useState<Record<string, unknown>>({});

  const { data: existingApplication, isLoading: loadingApplication } = useQuery<ApplicationStatus>({
    queryKey: ["/api/admin/applications/shop/my-application"],
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (!existingApplication) {
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Welcome to Exportunity — seller access.

This application desk will collect the business, product, experience, and supporting information required to review your seller access.

Approval is not automatic. Submitted facts remain subject to identity, compliance, product-truth, and operational review.

To begin: what is your company name?`,
          timestamp: new Date(),
        },
      ]);
    } else if (existingApplication.status !== "draft") {
      setCurrentStep(6);
    }
  }, [existingApplication]);

  const sendMessageMutation = useMutation({
    mutationFn: async (userMessage: string) =>
      apiRequest("/api/admin/applications/shop/chat", {
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
      apiRequest("/api/admin/applications/shop", {
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
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `Application submitted.

Your file is now under review. Exportunity will notify you when a decision or request for evidence is available.

Application ID: #${data.applicationId}
Status: ${data.status}`,
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
    return <ExportunityApplicationLoading testId="exportunity-seller-application-loading" />;
  }

  if (existingApplication && existingApplication.status !== "draft") {
    return (
      <ExportunityApplicationStatus
        testId="exportunity-seller-application-status"
        icon={Store}
        status={existingApplication.status}
        applicationId={existingApplication.id}
        approvedTitle="Seller access approved"
        approvedDescription="Your company can now continue into the governed seller workspace. Product publication remains subject to product-truth and operating controls."
        rejectedDescription="This application was not approved in its current form. Exportunity will contact you if another review path is available."
        reviewDescription="Your company information is being reviewed. We will notify you if supporting evidence or clarification is required."
        approvedAction={{ href: "/seller-dashboard", label: "Open seller workspace" }}
        backLabel="Back to marketplace"
      />
    );
  }

  return (
    <ExportunityApplicationConversation
      testId="exportunity-seller-application"
      title="Seller network application"
      description="Apply to offer verified products through the Exportunity Global Trade Network."
      icon={Store}
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
      backLabel="Back to marketplace"
    />
  );
}
