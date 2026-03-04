import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MindbaseLayout from "./MindbaseLayout";

const snippets = [
  {
    title: "Register",
    code: `curl -X POST https://mindbase.cloud/api/mindbase/auth/register \\
  -H "content-type: application/json" \\
  -d '{"email":"you@example.com","password":"StrongPass123!","display_name":"Your Name"}'`,
  },
  {
    title: "Create API Key",
    code: `curl -X POST https://mindbase.cloud/api/mindbase/workspaces/<workspaceId>/api-keys \\
  -H "authorization: Bearer <JWT>" \\
  -H "content-type: application/json" \\
  -d '{"label":"crm-integration"}'`,
  },
  {
    title: "Attach Agent to Workspace",
    code: `curl -X POST https://mindbase.cloud/api/mindbase/workspaces/<workspaceId>/agents/attach \\
  -H "authorization: Bearer <JWT>" \\
  -H "content-type: application/json" \\
  -d '{"agent_id":"<intellectId>"}'`,
  },
  {
    title: "Message Agent via API",
    code: `curl -X POST https://mindbase.cloud/api/mindbase/agents/<intellectId>/message \\
  -H "authorization: Bearer <workspace_api_key>" \\
  -H "content-type: application/json" \\
  -d '{"message":"Draft a procurement checklist for 50 units."}'`,
  },
  {
    title: "Inbound Email Webhook",
    code: `curl -X POST https://mindbase.cloud/api/mindbase/email/inbound \\
  -H "x-webhook-signature: <hmac_sha256_payload>" \\
  -H "content-type: application/json" \\
  -d '{"to":"agent@mindbase.cloud","from":"client@example.com","subject":"RFP","text":"Please review attached scope."}'`,
  },
];

export default function MindbaseDocsApiPage() {
  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Badge className="mb-2 bg-[#007BFF]/10 text-[#007BFF]">Docs/API</Badge>
        <h1 className="text-3xl font-semibold text-slate-900" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
          MindBase API quick reference
        </h1>
        <p className="mt-2 text-slate-600">
          Use JWT for user-level calls and workspace API keys for system-to-agent invocations.
        </p>

        <div className="mt-6 space-y-4">
          {snippets.map((snippet) => (
            <Card key={snippet.title} className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">{snippet.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{snippet.code}</pre>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </MindbaseLayout>
  );
}

