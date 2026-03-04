import { ReactNode } from "react";
import { NavigationBar } from "@/components/NavigationBar";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
  SidebarRail,
  SidebarInset,
} from "@/components/ui/sidebar";
import AgentHierarchy from "@/components/AgentHierarchy";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Agent } from "@db/schema";
import { useDashboard } from "@/hooks/use-dashboard";

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [isAgentListCollapsed, setIsAgentListCollapsed] = useState(false);
  const dashboard = useDashboard();

  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const availableAgents = agents.filter(agent => agent.role !== "CEO");

  const handleAgentSelect = (agent: Agent | null) => {
    if (dashboard) {
      dashboard.setSelectedAgent(agent);
    }
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="flex flex-col h-screen bg-gray-950">
        <NavigationBar />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar 
            className="border-r border-gray-700 bg-gradient-to-b from-gray-900 to-gray-900/95 backdrop-blur-sm"
            variant="inset"
            collapsible="icon"
          >
            <SidebarHeader className="border-b border-gray-700 bg-gray-900/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100 tracking-tight">Agents</h2>
                <SidebarTrigger className="hover:bg-gray-800 text-gray-300 hover:text-white transition-all duration-200 ease-in-out rounded-md" />
              </div>
            </SidebarHeader>

            <SidebarContent className="bg-transparent">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-200">Available Agents</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-gray-800 text-gray-300 hover:text-white transition-all duration-200 ease-in-out rounded-md hover:shadow-sm"
                    onClick={() => setIsAgentListCollapsed(!isAgentListCollapsed)}
                  >
                    {isAgentListCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div
                  className={cn(
                    "transition-all duration-300 ease-in-out overflow-hidden rounded-md bg-gray-800/50 backdrop-blur-sm border border-gray-700",
                    "hover:bg-gray-800/60 group",
                    isAgentListCollapsed ? "h-0 border-0" : "h-auto p-3"
                  )}
                >
                  <div className="space-y-1">
                    <AgentHierarchy
                      agents={availableAgents}
                      selectedAgent={dashboard?.selectedAgent || null}
                      onSelectAgent={handleAgentSelect}
                    />
                  </div>
                </div>
              </div>
            </SidebarContent>

            <SidebarRail className="hover:bg-gray-800/20 group-data-[state=collapsed]:hover:bg-gray-800/40 transition-colors duration-200" />
          </Sidebar>

          <SidebarInset className="bg-gray-950">
            {children}
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default DashboardLayout;