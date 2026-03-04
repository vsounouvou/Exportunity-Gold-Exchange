import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Star,
  Briefcase,
  Globe,
  MessageCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  Award,
  ArrowLeft,
  MessageSquare,
  Phone,
  Linkedin,
  ExternalLink,
  Mail
} from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/use-company";
import { resolveApiUrl } from "@/lib/runtimeConfig";

interface ExpertProfile {
  id: number;
  displayName: string;
  bio: string;
  longDescription?: string;
  avatar?: string;
  coverImage?: string;
  title: string;
  primaryExpertise: string;
  skills: string[];
  industries: string[];
  languages: string[];
  yearsOfExperience?: number;
  rating: number;
  totalHires: number;
  totalTasks: number;
  successRate: number;
  averageResponseTime?: number;
  currentPrice: number;
  pricingModel: string;
  customPricingTiers?: Array<{
    name: string;
    price: number;
    duration?: string;
    features?: string[];
  }>;
  whatsappNumber?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  email?: string;
  status: string;
  isFeatured: boolean;
  shortCode: string;
  profileUrl: string;
  metadata?: any;
  createdAt: string;
  publishedAt?: string;
  lastActiveAt?: string;
  performance?: {
    totalInteractions: number;
    totalTasksCompleted: number;
    averageRating: number;
    taskSuccessRate: number;
    clientSatisfactionScore: number;
  };
  recentRatings?: Array<{
    rating: number;
    reviewTitle?: string;
    reviewText?: string;
    createdAt: string;
  }>;
}

export function ExpertProfileDetailPage() {
  const [, params] = useRoute("/experts/:shortCode");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { selectedCompany } = useCompany();
  const [showHireDialog, setShowHireDialog] = useState(false);

  // Fetch expert profile
  const { data: expert, isLoading } = useQuery<ExpertProfile>({
    queryKey: ['/api/experts/profile', params?.shortCode],
    queryFn: async () => {
      const response = await fetch(resolveApiUrl(`/api/experts/profile/${params?.shortCode}`));
      if (!response.ok) {
        throw new Error('Expert not found');
      }
      return response.json();
    },
    enabled: !!params?.shortCode,
  });

  // Hire expert mutation
  const hireMutation = useMutation({
    mutationFn: async (data: { pricingModel: string; agreedPrice: number }) => {
      return await apiRequest(`/api/experts/${expert?.id}/hire`, {
        method: 'POST',
        body: JSON.stringify({
          companyId: selectedCompany?.id,
          ...data
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Expert Clone Hired!",
        description: `You've successfully hired ${expert?.displayName}. You can now chat with their AI clone.`,
      });
      setShowHireDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/experts/profile'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to hire expert clone",
        variant: "destructive",
      });
    }
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-white">Loading expert profile...</div>
      </div>
    );
  }

  if (!expert) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Expert Not Found</h2>
          <Button onClick={() => setLocation('/experts')}>
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Cover Image */}
      <div 
        className="h-64 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-b border-gray-800"
        style={expert.coverImage ? { backgroundImage: `url(${expert.coverImage})`, backgroundSize: 'cover' } : {}}
      />

      {/* Profile Header */}
      <div className="container mx-auto px-6 -mt-32 relative z-10">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/experts')}
          className="text-white mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Marketplace
        </Button>

        <Card className="bg-gray-900 border-gray-800 mb-8">
          <CardContent className="pt-6">
            <div className="flex gap-6 items-start">
              <Avatar className="h-32 w-32 border-4 border-gray-800">
                <AvatarImage src={expert.avatar} />
                <AvatarFallback className="bg-blue-600 text-white text-4xl">
                  {expert.displayName.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{expert.displayName}</h1>
                    <p className="text-xl text-gray-300 mb-2">{expert.title}</p>
                    <p className="text-gray-400">{expert.bio}</p>
                  </div>
                  {expert.isFeatured && (
                    <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                      <Award className="h-4 w-4 mr-1" />
                      Featured
                    </Badge>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-6 mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                      <span className="text-2xl font-bold text-white">{expert.rating.toFixed(1)}</span>
                    </div>
                    <div className="text-sm text-gray-400">Rating</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase className="h-5 w-5 text-blue-500" />
                      <span className="text-2xl font-bold text-white">{expert.totalHires}</span>
                    </div>
                    <div className="text-sm text-gray-400">Total Hires</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-2xl font-bold text-white">{expert.successRate.toFixed(0)}%</span>
                    </div>
                    <div className="text-sm text-gray-400">Success Rate</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-5 w-5 text-purple-500" />
                      <span className="text-2xl font-bold text-white">
                        {expert.averageResponseTime ? `${Math.round(expert.averageResponseTime / 60)}m` : 'N/A'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">Avg Response</div>
                  </div>
                </div>

                {/* Contact Buttons */}
                <div className="flex gap-3">
                  <Dialog open={showHireDialog} onOpenChange={setShowHireDialog}>
                    <DialogTrigger asChild>
                      <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                        <MessageCircle className="h-5 w-5 mr-2" />
                        Hire Expert Clone - ${expert.currentPrice}/{expert.pricingModel === 'per_hour' ? 'hr' : expert.pricingModel.replace('_', ' ')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-gray-900 border-gray-800">
                      <DialogHeader>
                        <DialogTitle className="text-white">Hire {expert.displayName}</DialogTitle>
                        <DialogDescription className="text-gray-400">
                          You're about to hire this expert's AI clone for your company.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="text-white">
                          <p className="font-medium mb-2">Pricing: ${expert.currentPrice} per {expert.pricingModel.replace('_', ' ')}</p>
                          <p className="text-sm text-gray-400">Company: {selectedCompany?.name || 'Select a company first'}</p>
                        </div>
                        {selectedCompany ? (
                          <Button
                            onClick={() => hireMutation.mutate({
                              pricingModel: expert.pricingModel,
                              agreedPrice: expert.currentPrice
                            })}
                            disabled={hireMutation.isPending}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                          >
                            {hireMutation.isPending ? 'Processing...' : 'Confirm & Hire'}
                          </Button>
                        ) : (
                          <p className="text-yellow-500 text-sm">Please select a company before hiring.</p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  {expert.whatsappNumber && (
                    <Button variant="outline" size="lg" asChild>
                      <a href={`https://wa.me/${expert.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                        <Phone className="h-5 w-5 mr-2" />
                        WhatsApp
                      </a>
                    </Button>
                  )}
                  {expert.linkedinUrl && (
                    <Button variant="outline" size="lg" asChild>
                      <a href={expert.linkedinUrl} target="_blank" rel="noopener noreferrer">
                        <Linkedin className="h-5 w-5 mr-2" />
                        LinkedIn
                      </a>
                    </Button>
                  )}
                  {expert.email && (
                    <Button variant="outline" size="lg" asChild>
                      <a href={`mailto:${expert.email}`}>
                        <Mail className="h-5 w-5 mr-2" />
                        Email
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Content */}
        <Tabs defaultValue="about" className="mb-12">
          <TabsList className="bg-gray-900 border border-gray-800">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="space-y-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">About {expert.displayName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="text-gray-300">{expert.longDescription || expert.bio}</p>
                </div>

                <div>
                  <h3 className="text-white font-semibold mb-3">Skills & Expertise</h3>
                  <div className="flex flex-wrap gap-2">
                    {expert.skills.map((skill, idx) => (
                      <Badge key={idx} variant="outline" className="bg-blue-600/10 border-blue-600/30 text-blue-400">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-white font-semibold mb-3">Industries</h3>
                    <div className="flex flex-wrap gap-2">
                      {expert.industries.map((industry, idx) => (
                        <Badge key={idx} variant="outline" className="bg-gray-800 border-gray-700 text-gray-300">
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold mb-3">Languages</h3>
                    <div className="flex flex-wrap gap-2">
                      {expert.languages.map((lang, idx) => (
                        <Badge key={idx} variant="outline" className="bg-gray-800 border-gray-700 text-gray-300">
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {expert.yearsOfExperience && (
                  <div>
                    <h3 className="text-white font-semibold mb-2">Experience</h3>
                    <p className="text-gray-300">{expert.yearsOfExperience} years of professional experience</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Client Reviews</CardTitle>
                <CardDescription className="text-gray-400">
                  {expert.recentRatings?.length || 0} reviews
                </CardDescription>
              </CardHeader>
              <CardContent>
                {expert.recentRatings && expert.recentRatings.length > 0 ? (
                  <div className="space-y-4">
                    {expert.recentRatings.map((review, idx) => (
                      <div key={idx} className="border-b border-gray-800 pb-4 last:border-0">
                        <div className="flex items-center gap-2 mb-2">
                          {[...Array(5)].map((_, i) => (
                            <Star 
                              key={i} 
                              className={`h-4 w-4 ${i < review.rating ? 'fill-yellow-500 text-yellow-500' : 'text-gray-600'}`}
                            />
                          ))}
                          <span className="text-sm text-gray-400">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {review.reviewTitle && (
                          <h4 className="text-white font-medium mb-1">{review.reviewTitle}</h4>
                        )}
                        {review.reviewText && (
                          <p className="text-gray-300">{review.reviewText}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-center py-8">No reviews yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white">Pricing Options</CardTitle>
              </CardHeader>
              <CardContent>
                {expert.customPricingTiers && expert.customPricingTiers.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    {expert.customPricingTiers.map((tier, idx) => (
                      <Card key={idx} className="bg-gray-800 border-gray-700">
                        <CardHeader>
                          <CardTitle className="text-white">{tier.name}</CardTitle>
                          <CardDescription className="text-gray-400">{tier.duration}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="text-3xl font-bold text-white mb-4">${tier.price}</div>
                          {tier.features && (
                            <ul className="space-y-2">
                              {tier.features.map((feature, fidx) => (
                                <li key={fidx} className="flex items-center gap-2 text-sm text-gray-300">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  {feature}
                                </li>
                              ))}
                            </ul>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-4xl font-bold text-white mb-2">${expert.currentPrice}</div>
                    <div className="text-gray-400">
                      {expert.pricingModel === 'per_hour' ? 'per hour' : 
                       expert.pricingModel === 'per_task' ? 'per task' : 
                       expert.pricingModel === 'monthly_subscription' ? 'per month' : 'custom pricing'}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
