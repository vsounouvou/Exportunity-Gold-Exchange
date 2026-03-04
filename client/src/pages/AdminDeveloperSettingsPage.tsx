import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

type TranscriptionJob = {
  id: number;
  status: "SUCCESS" | "FAILED";
  provider: string | null;
  durationMs: number;
  errorCode: string | null;
  createdAt: string | null;
  userName: string | null;
};

type QuickTokenResponse = {
  token: string;
  tokenPrefix: string;
  redeemUrl: string;
  qrCodeDataUrl: string;
  expiresAt: string;
};

export default function AdminDeveloperSettingsPage() {
  const jobsQuery = useQuery<{ jobs: TranscriptionJob[] }>({
    queryKey: ["/api/admin/transcription-jobs?limit=20"],
    refetchInterval: 15000,
  });
  const [quickToken, setQuickToken] = useState<QuickTokenResponse | null>(null);

  const quickTokenMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/chairman/quick-token", {
        method: "POST",
        headers: { "x-chairman-admin-override": "1" },
        body: JSON.stringify({ expiresInMinutes: 10 }),
      }),
    onSuccess: (payload: QuickTokenResponse) => {
      setQuickToken(payload);
    },
  });

  const jobs = Array.isArray(jobsQuery.data?.jobs) ? jobsQuery.data!.jobs : [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Admin &gt; Settings &gt; Developer</h1>
        <p className="text-sm text-gray-400">Voice Debug: last 20 transcription jobs (provider, duration, and failures).</p>
        <p className="text-xs text-gray-500">autoSendAfterTranscription: false (default)</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Voice Debug</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 bg-gray-800" />
              <Skeleton className="h-9 bg-gray-800" />
              <Skeleton className="h-9 bg-gray-800" />
            </div>
          ) : jobsQuery.isError ? (
            <div className="text-sm text-red-300">Failed to load transcription jobs.</div>
          ) : jobs.length === 0 ? (
            <div className="text-sm text-gray-400">No transcription jobs yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-800">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Error</th>
                    <th className="py-2">User</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b border-gray-900/80 text-gray-200">
                      <td className="py-2 pr-3 whitespace-nowrap">{job.createdAt ? new Date(job.createdAt).toLocaleString() : "-"}</td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant="outline"
                          className={
                            job.status === "SUCCESS"
                              ? "border-emerald-500/40 text-emerald-300"
                              : "border-rose-500/40 text-rose-300"
                          }
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{job.provider || "-"}</td>
                      <td className="py-2 pr-3">{Math.max(0, Number(job.durationMs || 0))} ms</td>
                      <td className="py-2 pr-3">{job.errorCode || "-"}</td>
                      <td className="py-2">{job.userName || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Chairman Quick Chat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="bg-blue-600 hover:bg-blue-500 text-white"
              onClick={() => quickTokenMutation.mutate()}
              disabled={quickTokenMutation.isPending}
            >
              {quickTokenMutation.isPending ? "Generating..." : "Generate QR"}
            </Button>
            {quickToken ? (
              <span className="text-xs text-gray-400">
                Expires: {new Date(quickToken.expiresAt).toLocaleString()}
              </span>
            ) : null}
          </div>

          {quickToken ? (
            <div className="grid gap-3 md:grid-cols-[220px,1fr]">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 flex items-center justify-center">
                <img src={quickToken.qrCodeDataUrl} alt="Quick chat QR" className="h-[180px] w-[180px]" />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-gray-400">Quick link</div>
                <div className="rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-gray-200 break-all">
                  {quickToken.redeemUrl}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/15 text-white/80 hover:text-white"
                  onClick={() => navigator.clipboard.writeText(quickToken.redeemUrl)}
                >
                  Copy link
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">Generate a one-time QR to open Tassi quick chat.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
