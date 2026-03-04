import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MindbaseLayout from "./MindbaseLayout";
import { mindbasePath } from "./routing";

type CreatorPayload = {
  ok: boolean;
  profile: {
    display_name: string;
    headline: string | null;
    bio: string | null;
    avatar_url: string | null;
    location: string | null;
    share_slug: string;
    verification_status: string;
  };
  intellects: Array<{
    id: string;
    name: string;
    slug: string;
    tagline: string | null;
    category: string;
    access_policy: "private" | "public" | "paid";
    price_per_100_messages: number;
  }>;
};

export default function MindbaseCreatorProfilePage({ slug }: { slug: string }) {
  const query = useQuery<CreatorPayload>({
    queryKey: [`/api/mindbase/creators/${encodeURIComponent(slug)}`],
    staleTime: 20_000,
  });

  const profile = query.data?.profile;
  const agents = query.data?.intellects || [];

  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {query.isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        ) : profile ? (
          <>
            <Card className="mb-5 border-[var(--border)] bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-2xl text-[var(--text)]" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
                  {profile.display_name}
                </CardTitle>
                <p className="text-[var(--muted)]">{profile.headline || "MindBase creator"}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-[var(--muted)]">
                {profile.bio ? <p>{profile.bio}</p> : null}
                <div className="text-xs text-[var(--muted)]">
                  {profile.location ? `Location: ${profile.location}` : "Location not set"} | Verification: {profile.verification_status}
                </div>
              </CardContent>
            </Card>

            <h2 className="mb-3 text-xl font-semibold text-[var(--text)]" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
              Published Agents
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((item) => (
                <Card
                  key={item.id}
                  className="rounded-[14px] border-[var(--border)] bg-[var(--card)] text-[var(--text)]"
                  style={{ boxShadow: "0 6px 20px rgba(15, 23, 42, 0.06)" }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-[var(--text)]">{item.name}</CardTitle>
                    <p className="line-clamp-2 text-sm text-[var(--muted)]">
                      {item.tagline || "Digital expert profile for practical execution."}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--chipBg)] px-2.5 py-0.5 font-semibold text-[var(--chipText)]">
                        {item.category}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">
                        {item.access_policy === "paid" ? `${item.price_per_100_messages} credits / 100 msgs` : "Free"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center">
                      <Link href={mindbasePath(`/i/${item.slug}`)}>
                        <a className="inline-flex min-w-[110px] items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--chipBg)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-slate-200">
                          Preview
                        </a>
                      </Link>
                      <Link href={mindbasePath(`/i/${item.slug}`)}>
                        <a className="inline-flex min-w-[110px] items-center justify-center rounded-[10px] bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primaryHover)]">
                          Hire
                        </a>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!agents.length ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
                  No published Agents yet.
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-6 text-sm text-red-700">Creator profile not found.</CardContent>
          </Card>
        )}
      </main>
    </MindbaseLayout>
  );
}
