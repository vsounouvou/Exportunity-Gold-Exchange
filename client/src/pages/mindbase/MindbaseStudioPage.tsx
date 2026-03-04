import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MindbaseLayout from "./MindbaseLayout";
import { mindbasePath } from "./routing";

type StudioProfilePayload = {
  ok: boolean;
  profile: {
    id: string;
    display_name: string;
    headline: string | null;
    bio: string | null;
    location: string | null;
    share_slug: string;
    verification_status: string;
  };
  mindbase?: {
    id: string;
    slug: string;
    title: string;
    tagline: string | null;
    description: string | null;
    is_published: boolean;
  } | null;
  credits: number;
};

type StudioIntellect = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  category: string;
  accessPolicy: "private" | "public" | "paid";
  pricePer100Messages: number;
  publishStatus: string;
  isPublished: boolean;
};

type StudioIntellectPayload = {
  ok: boolean;
  items: StudioIntellect[];
};

export default function MindbaseStudioPage() {
  const { isAuthenticated } = useSession();
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");

  const [mindbaseTitle, setMindbaseTitle] = useState("");
  const [mindbaseTagline, setMindbaseTagline] = useState("");
  const [mindbaseDescription, setMindbaseDescription] = useState("");

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState("general");
  const [personaRole, setPersonaRole] = useState("");
  const [personaTone, setPersonaTone] = useState("");
  const [personaRules, setPersonaRules] = useState("");
  const [styleConstraints, setStyleConstraints] = useState("");
  const [exampleOutputs, setExampleOutputs] = useState("");
  const [accessPolicy, setAccessPolicy] = useState<"private" | "public" | "paid">("private");
  const [price, setPrice] = useState("0");

  const profileQuery = useQuery<StudioProfilePayload>({
    queryKey: ["/api/mindbase/studio/profile"],
    enabled: isAuthenticated,
    staleTime: 8_000,
  });

  const intellectsQuery = useQuery<StudioIntellectPayload>({
    queryKey: ["/api/mindbase/studio/intellects"],
    enabled: isAuthenticated,
    staleTime: 8_000,
  });

  const profileLoaded = profileQuery.data?.profile;
  const mindbaseLoaded = profileQuery.data?.mindbase;
  const intellects = useMemo(() => intellectsQuery.data?.items || [], [intellectsQuery.data?.items]);

  const updateProfile = useMutation({
    mutationFn: async () =>
      apiRequest("/api/mindbase/studio/profile", "PUT", {
        display_name: displayName,
        headline,
        bio,
        location,
        mindbase_title: mindbaseTitle,
        mindbase_tagline: mindbaseTagline,
        mindbase_description: mindbaseDescription,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mindbase/studio/profile"] });
    },
  });

  const createIntellect = useMutation({
    mutationFn: async () =>
      apiRequest("/api/mindbase/studio/intellects", "POST", {
        name,
        tagline,
        category,
        persona_role: personaRole,
        persona_tone: personaTone,
        persona_rules: personaRules
          .split("\n")
          .map((entry) => entry.trim())
          .filter(Boolean),
        style_constraints: [
          ...styleConstraints
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean),
          ...(exampleOutputs.trim() ? [`Example outputs: ${exampleOutputs.trim()}`] : []),
        ],
        access_policy: accessPolicy,
        price_per_100_messages: Number.parseInt(price || "0", 10) || 0,
      }),
    onSuccess: () => {
      setName("");
      setTagline("");
      setCategory("general");
      setPersonaRole("");
      setPersonaTone("");
      setPersonaRules("");
      setStyleConstraints("");
      setExampleOutputs("");
      setAccessPolicy("private");
      setPrice("0");
      queryClient.invalidateQueries({ queryKey: ["/api/mindbase/studio/intellects"] });
    },
  });

  if (!isAuthenticated) {
    return (
      <MindbaseLayout>
        <main className="mx-auto w-full max-w-4xl px-4 py-10">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Build My MindBase</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>You need an account to create and publish your Agent.</p>
              <Button asChild className="bg-[#007BFF] hover:bg-[#006AE0]">
                <Link href={`/login?next=${encodeURIComponent(mindbasePath("/studio"))}`}>Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </MindbaseLayout>
    );
  }

  return (
    <MindbaseLayout>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "Poppins, Roboto, sans-serif" }}>
              Build My MindBase
            </h1>
            <p className="text-sm text-slate-600">Create your profile, configure your MindBase, then launch Agents.</p>
          </div>
          <div className="text-sm text-slate-700">
            Credits: <span className="font-semibold text-emerald-700">{Number(profileQuery.data?.credits || 0)}</span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <Badge className="bg-[#007BFF]/10 text-[#007BFF]">Step 1: Profile</Badge>
          <Badge className="bg-[#007BFF]/10 text-[#007BFF]">Step 2: MindBase</Badge>
          <Badge className="bg-[#007BFF]/10 text-[#007BFF]">Step 3: First Agent</Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">1) Profile & MindBase</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Display name</Label>
                  <Input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={profileLoaded?.display_name || "Your name"}
                    className="border-slate-300 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Headline</Label>
                  <Input
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    placeholder={profileLoaded?.headline || "What you do"}
                    className="border-slate-300 bg-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder={profileLoaded?.location || "City, Country"}
                  className="border-slate-300 bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label>Bio</Label>
                <Textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder={profileLoaded?.bio || "Your expertise and outcomes"}
                  className="min-h-[80px] border-slate-300 bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label>MindBase title</Label>
                <Input
                  value={mindbaseTitle}
                  onChange={(event) => setMindbaseTitle(event.target.value)}
                  placeholder={mindbaseLoaded?.title || "Your MindBase title"}
                  className="border-slate-300 bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label>MindBase tagline</Label>
                <Input
                  value={mindbaseTagline}
                  onChange={(event) => setMindbaseTagline(event.target.value)}
                  placeholder={mindbaseLoaded?.tagline || "What your MindBase is about"}
                  className="border-slate-300 bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label>MindBase description</Label>
                <Textarea
                  value={mindbaseDescription}
                  onChange={(event) => setMindbaseDescription(event.target.value)}
                  placeholder={mindbaseLoaded?.description || "Describe your MindBase mission"}
                  className="min-h-[80px] border-slate-300 bg-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending} className="bg-[#007BFF] hover:bg-[#006AE0]">
                  {updateProfile.isPending ? "Saving..." : "Save profile"}
                </Button>
                {profileLoaded?.share_slug ? (
                  <Link href={mindbasePath(`/c/${profileLoaded.share_slug}`)}>
                    <a className="text-sm text-[#007BFF] hover:underline">Public profile</a>
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">2) Create First Agent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Agent name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} className="border-slate-300 bg-white" />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Input value={category} onChange={(event) => setCategory(event.target.value)} className="border-slate-300 bg-white" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>One-line expertise</Label>
                <Input value={tagline} onChange={(event) => setTagline(event.target.value)} className="border-slate-300 bg-white" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Input
                    value={personaRole}
                    onChange={(event) => setPersonaRole(event.target.value)}
                    placeholder="What this agent does"
                    className="border-slate-300 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tone</Label>
                  <Input
                    value={personaTone}
                    onChange={(event) => setPersonaTone(event.target.value)}
                    placeholder="Direct, friendly, formal..."
                    className="border-slate-300 bg-white"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Rules (one per line)</Label>
                <Textarea
                  value={personaRules}
                  onChange={(event) => setPersonaRules(event.target.value)}
                  placeholder="Ask clarifying questions first"
                  className="min-h-[84px] border-slate-300 bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label>Style constraints (one per line)</Label>
                <Textarea
                  value={styleConstraints}
                  onChange={(event) => setStyleConstraints(event.target.value)}
                  placeholder="Use bullet points, concise sections..."
                  className="min-h-[84px] border-slate-300 bg-white"
                />
              </div>
              <div className="space-y-1">
                <Label>Example outputs</Label>
                <Textarea
                  value={exampleOutputs}
                  onChange={(event) => setExampleOutputs(event.target.value)}
                  placeholder="Give one or two output examples"
                  className="min-h-[72px] border-slate-300 bg-white"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Pricing mode</Label>
                  <select
                    value={accessPolicy}
                    onChange={(event) => setAccessPolicy(event.target.value as "private" | "public" | "paid")}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Credits per 100 messages</Label>
                  <Input value={price} onChange={(event) => setPrice(event.target.value)} className="border-slate-300 bg-white" />
                </div>
              </div>
              <Button type="button" disabled={!name.trim() || createIntellect.isPending} onClick={() => createIntellect.mutate()} className="bg-[#007BFF] hover:bg-[#006AE0]">
                {createIntellect.isPending ? "Creating..." : "Create Agent"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-5 border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">3) Your Agents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {intellectsQuery.isLoading ? (
              <div className="text-sm text-slate-500">Loading agents...</div>
            ) : intellects.length ? (
              intellects.map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-600">{item.tagline || "No one-line expertise yet"}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                        {item.accessPolicy}
                      </Badge>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                        {item.publishStatus}
                      </Badge>
                      <Link href={mindbasePath(`/studio/intellects/${item.id}`)}>
                        <a className="text-[#007BFF] hover:underline">Configure</a>
                      </Link>
                      <Link href={mindbasePath(`/i/${item.slug}`)}>
                        <a className="text-[#007BFF] hover:underline">Preview</a>
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No Agents yet.</div>
            )}
          </CardContent>
        </Card>
      </main>
    </MindbaseLayout>
  );
}
