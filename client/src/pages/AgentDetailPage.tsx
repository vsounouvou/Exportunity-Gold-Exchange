import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link, Redirect, useRoute } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

type AgentDefinitionResponse = {
  ok?: boolean;
  agent?: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveRuntimeAgentId(agent: Record<string, unknown> | null | undefined): number {
  const record = asRecord(agent);
  const approvalPolicy = asRecord(record.approval_policy ?? record.approvalPolicy);
  const candidates = [
    record.runtimeAgentId,
    record.runtime_agent_id,
    approvalPolicy.runtimeAgentId,
    approvalPolicy.runtime_agent_id,
  ];

  for (const candidate of candidates) {
    const id = Number(candidate || 0);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return 0;
}

/**
 * Compatibility adapter for retired agent-detail URLs.
 *
 * The former page duplicated profile, mailbox, communications, task and log
 * workspaces. Keeping that renderer reachable created two competing interfaces
 * over the same records. Old URLs now resolve into the single current GTN
 * runtime profile. Agent definitions without a provisioned runtime return to
 * the current Agents OS registry, where provisioning is governed.
 */
export function AgentDetailPage() {
  const [, legacyParams] = useRoute("/agents/:agentId");
  const [, adminParams] = useRoute("/admin/agents-os/agents/:id");
  const [, definitionParams] = useRoute("/agents-os/agents/:id");

  const legacyAgentId = Number((legacyParams as { agentId?: string } | null)?.agentId || 0);
  const definitionId = Number(
    (adminParams as { id?: string } | null)?.id ||
      (definitionParams as { id?: string } | null)?.id ||
      0,
  );
  const hasLegacyRuntimeId = Number.isInteger(legacyAgentId) && legacyAgentId > 0;
  const hasDefinitionId = Number.isInteger(definitionId) && definitionId > 0;

  const definitionQuery = useQuery<AgentDefinitionResponse>({
    queryKey: hasDefinitionId
      ? [`/api/admin/agents/${definitionId}`]
      : ["__no_retired_agent_definition_redirect__"],
    enabled: !hasLegacyRuntimeId && hasDefinitionId,
    queryFn: () => apiRequest(`/api/admin/agents/${definitionId}`, "GET"),
    staleTime: 30_000,
    retry: false,
  });

  if (hasLegacyRuntimeId) {
    return <Redirect to={`/operations/agents/${legacyAgentId}`} />;
  }

  if (!hasDefinitionId) {
    return <Redirect to="/agents-os?tab=registry" />;
  }

  if (definitionQuery.data) {
    const runtimeAgentId = resolveRuntimeAgentId(definitionQuery.data.agent);
    return runtimeAgentId > 0 ? (
      <Redirect to={`/operations/agents/${runtimeAgentId}`} />
    ) : (
      <Redirect to="/agents-os?tab=registry" />
    );
  }

  return (
    <div
      data-testid="exportunity-retired-agent-detail-redirect"
      className="light min-h-full bg-[#f7f8fa] p-4 text-slate-950 md:p-6"
    >
      <Card className="mx-auto max-w-xl border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-950">
            {definitionQuery.isError ? "Agent workspace unavailable" : "Opening current agent workspace"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          {definitionQuery.isError ? (
            <>
              <p>
                This retired detail URL could not resolve its linked runtime agent. The agent definition remains
                available in the current Agents OS registry.
              </p>
              <Link href="/agents-os?tab=registry">
                <Button variant="outline" className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return to Agents OS
                </Button>
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-[#f5a623]" />
              <span>Resolving the linked GTN runtime profile…</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AgentDetailPage;
