import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Megaphone, 
  FileText, 
  Calendar,
  BarChart3,
  Plus,
  Eye,
  Heart,
  Share2,
  MessageSquare,
  TrendingUp,
  ArrowUpRight,
  Clock,
  Image,
  Video,
  PenTool
} from "lucide-react";

interface Campaign {
  id: number;
  name: string;
  status: 'active' | 'scheduled' | 'completed' | 'draft';
  type: string;
  reach: number;
  engagement: number;
  startDate: string;
  endDate: string;
}

interface ContentItem {
  id: number;
  title: string;
  type: 'blog' | 'social' | 'video' | 'image';
  status: 'published' | 'scheduled' | 'draft';
  scheduledFor?: string;
  engagement: number;
}

const mockCampaigns: Campaign[] = [
  { id: 1, name: "Q4 Product Launch", status: "active", type: "Multi-channel", reach: 15000, engagement: 3200, startDate: "Nov 1", endDate: "Dec 31" },
  { id: 2, name: "Holiday Sale", status: "scheduled", type: "Email + Social", reach: 0, engagement: 0, startDate: "Dec 15", endDate: "Dec 25" },
  { id: 3, name: "Brand Awareness", status: "completed", type: "Social Media", reach: 45000, engagement: 8900, startDate: "Oct 1", endDate: "Oct 31" },
];

const mockContent: ContentItem[] = [
  { id: 1, title: "10 Tips for Better Productivity", type: "blog", status: "published", engagement: 1240 },
  { id: 2, title: "Weekly Update - Product Features", type: "social", status: "scheduled", scheduledFor: "Tomorrow, 9:00 AM", engagement: 0 },
  { id: 3, title: "Behind the Scenes Video", type: "video", status: "draft", engagement: 0 },
  { id: 4, title: "Customer Success Story", type: "image", status: "published", engagement: 890 },
];

const statusColors = {
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  scheduled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  draft: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  published: "bg-green-500/20 text-green-400 border-green-500/30",
};

const contentTypeIcons = {
  blog: FileText,
  social: MessageSquare,
  video: Video,
  image: Image,
};

export function MarketingPage() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (location.includes('/campaigns')) return 'campaigns';
    if (location.includes('/content')) return 'content';
    if (location.includes('/calendar')) return 'calendar';
    if (location.includes('/metrics')) return 'metrics';
    return 'campaigns';
  });

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-purple-400" />
              Marketing
            </h1>
            <p className="text-gray-400 mt-1">Manage campaigns, content, and track performance</p>
          </div>
          <Button className="bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Reach</p>
                  <p className="text-2xl font-bold text-white">60K</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-purple-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>18% from last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Engagement</p>
                  <p className="text-2xl font-bold text-white">12.1K</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-pink-500/20 flex items-center justify-center">
                  <Heart className="h-5 w-5 text-pink-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-green-400 text-sm">
                <ArrowUpRight className="h-4 w-4" />
                <span>8% improvement</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Active Campaigns</p>
                  <p className="text-2xl font-bold text-white">3</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Megaphone className="h-5 w-5 text-blue-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-blue-400 text-sm">
                <span>1 scheduled</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Content Published</p>
                  <p className="text-2xl font-bold text-white">24</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-green-400" />
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-gray-400 text-sm">
                <span>This month</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="campaigns" className="data-[state=active]:bg-gray-800">Campaigns</TabsTrigger>
            <TabsTrigger value="content" className="data-[state=active]:bg-gray-800">Content</TabsTrigger>
            <TabsTrigger value="calendar" className="data-[state=active]:bg-gray-800">Calendar</TabsTrigger>
            <TabsTrigger value="metrics" className="data-[state=active]:bg-gray-800">Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns" className="space-y-4">
            <div className="grid gap-4">
              {mockCampaigns.map((campaign) => (
                <Card key={campaign.id} className="bg-gray-900 border-gray-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Megaphone className="h-6 w-6 text-purple-400" />
                        </div>
                        <div>
                          <div className="font-medium text-white">{campaign.name}</div>
                          <div className="text-sm text-gray-400">{campaign.type} • {campaign.startDate} - {campaign.endDate}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-sm text-gray-400">Reach</div>
                          <div className="text-white font-medium">{campaign.reach.toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400">Engagement</div>
                          <div className="text-white font-medium">{campaign.engagement.toLocaleString()}</div>
                        </div>
                        <Badge variant="outline" className={statusColors[campaign.status]}>
                          {campaign.status}
                        </Badge>
                      </div>
                    </div>
                    {campaign.status === 'active' && (
                      <div className="mt-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">Campaign Progress</span>
                          <span className="text-gray-400">65%</span>
                        </div>
                        <Progress value={65} className="h-2" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="content" className="space-y-4">
            <div className="flex gap-2 mb-4">
              <Button variant="outline" size="sm" className="border-gray-700">
                <PenTool className="h-4 w-4 mr-2" />
                Create Post
              </Button>
              <Button variant="outline" size="sm" className="border-gray-700">
                <FileText className="h-4 w-4 mr-2" />
                Write Article
              </Button>
              <Button variant="outline" size="sm" className="border-gray-700">
                <Video className="h-4 w-4 mr-2" />
                Upload Video
              </Button>
            </div>
            
            <div className="grid gap-4">
              {mockContent.map((item) => {
                const Icon = contentTypeIcons[item.type];
                return (
                  <Card key={item.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 cursor-pointer transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-lg bg-gray-800 flex items-center justify-center">
                            <Icon className="h-5 w-5 text-gray-400" />
                          </div>
                          <div>
                            <div className="font-medium text-white">{item.title}</div>
                            <div className="text-sm text-gray-400 capitalize">{item.type}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {item.scheduledFor && (
                            <div className="flex items-center gap-1 text-sm text-gray-400">
                              <Clock className="h-4 w-4" />
                              {item.scheduledFor}
                            </div>
                          )}
                          {item.engagement > 0 && (
                            <div className="flex items-center gap-1 text-sm text-gray-400">
                              <Heart className="h-4 w-4" />
                              {item.engagement.toLocaleString()}
                            </div>
                          )}
                          <Badge variant="outline" className={statusColors[item.status]}>
                            {item.status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="calendar" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Content Calendar</CardTitle>
                <CardDescription>Schedule and plan your content</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-400">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Calendar view coming soon</p>
                  <p className="text-sm mt-2">Plan and schedule your content across all channels</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Performance Metrics</CardTitle>
                <CardDescription>Track your marketing performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-400">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Analytics dashboard coming soon</p>
                  <p className="text-sm mt-2">View engagement, reach, and conversion metrics</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
