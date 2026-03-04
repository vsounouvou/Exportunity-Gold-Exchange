import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Star, Briefcase, Globe, TrendingUp, Filter } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

interface ExpertProfile {
  id: number;
  displayName: string;
  bio: string;
  avatar?: string;
  title: string;
  primaryExpertise: string;
  skills: string[];
  industries: string[];
  rating: number;
  totalHires: number;
  successRate: number;
  currentPrice: number;
  pricingModel: string;
  isFeatured: boolean;
  shortCode: string;
  profileUrl: string;
}

export function ExpertMarketplacePage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [expertiseFilter, setExpertiseFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [minRating, setMinRating] = useState<number>(0);

  // Fetch all expert profiles
  const { data: experts = [], isLoading } = useQuery<ExpertProfile[]>({
    queryKey: ['/api/experts/marketplace', { expertise: expertiseFilter, industry: industryFilter, minRating }],
  });

  // Filter experts by search query
  const filteredExperts = experts.filter(expert => {
    const matchesSearch = searchQuery === "" || 
      expert.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expert.bio?.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSearch;
  });

  // Featured experts
  const featuredExperts = filteredExperts.filter(e => e.isFeatured);
  const regularExperts = filteredExperts.filter(e => !e.isFeatured);

  const expertiseOptions = [
    { value: "all", label: "All Expertise" },
    { value: "gold_trading", label: "Gold Trading" },
    { value: "accounting", label: "Accounting" },
    { value: "hr", label: "Human Resources" },
    { value: "business_consulting", label: "Business Consulting" },
    { value: "marketing", label: "Marketing" },
    { value: "legal", label: "Legal" },
    { value: "engineering", label: "Engineering" },
    { value: "education", label: "Education" },
  ];

  const industryOptions = [
    { value: "all", label: "All Industries" },
    { value: "gold_metals", label: "Gold & Metals" },
    { value: "education", label: "Education" },
    { value: "construction", label: "Construction" },
    { value: "technology", label: "Technology" },
    { value: "trade_export", label: "Trade & Export" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border-b border-gray-800">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold text-white mb-4">
              Hire Expert AI Clones
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              Connect with AI clones of world-class experts. Scale expertise infinitely with confidential, 
              personalized AI assistants trained by the best in their fields.
            </p>
            
            {/* Search Bar */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <Input
                  placeholder="Search experts by name, expertise, or industry..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-gray-900 border-gray-700 text-white h-12"
                />
              </div>
              <Button className="h-12">
                <Search className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Filters */}
        <div className="flex gap-4 mb-8 flex-wrap items-center">
          <div className="flex items-center gap-2 text-gray-400">
            <Filter className="h-5 w-5" />
            <span className="font-medium">Filters:</span>
          </div>
          
          <Select value={expertiseFilter} onValueChange={setExpertiseFilter}>
            <SelectTrigger className="w-[200px] bg-gray-900 border-gray-700 text-white">
              <SelectValue placeholder="Expertise" />
            </SelectTrigger>
            <SelectContent>
              {expertiseOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger className="w-[200px] bg-gray-900 border-gray-700 text-white">
              <SelectValue placeholder="Industry" />
            </SelectTrigger>
            <SelectContent>
              {industryOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={minRating.toString()} onValueChange={(v) => setMinRating(parseFloat(v))}>
            <SelectTrigger className="w-[180px] bg-gray-900 border-gray-700 text-white">
              <SelectValue placeholder="Minimum Rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any Rating</SelectItem>
              <SelectItem value="3">3+ Stars</SelectItem>
              <SelectItem value="4">4+ Stars</SelectItem>
              <SelectItem value="4.5">4.5+ Stars</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto text-sm text-gray-400">
            {filteredExperts.length} experts found
          </div>
        </div>

        {/* Featured Experts */}
        {featuredExperts.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-yellow-500" />
              <h2 className="text-2xl font-bold text-white">Featured Experts</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredExperts.map((expert) => (
                <ExpertCard key={expert.id} expert={expert} setLocation={setLocation} />
              ))}
            </div>
          </div>
        )}

        {/* All Experts */}
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">All Experts</h2>
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Loading experts...</div>
          ) : regularExperts.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No experts found. Try adjusting your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularExperts.map((expert) => (
                <ExpertCard key={expert.id} expert={expert} setLocation={setLocation} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpertCard({ expert, setLocation }: { expert: ExpertProfile; setLocation: (path: string) => void }) {
  return (
    <Card className="bg-gray-900 border-gray-800 hover:border-blue-600 transition-all cursor-pointer group"
          onClick={() => setLocation(`/experts/${expert.shortCode}`)}>
      <CardHeader>
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16 border-2 border-gray-700 group-hover:border-blue-600 transition-colors">
            <AvatarImage src={expert.avatar} />
            <AvatarFallback className="bg-blue-600 text-white text-lg">
              {expert.displayName.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-white text-lg mb-1 truncate">{expert.displayName}</CardTitle>
            <CardDescription className="text-gray-400 text-sm">{expert.title}</CardDescription>
          </div>
          {expert.isFeatured && (
            <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
              Featured
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bio */}
        <p className="text-sm text-gray-300 line-clamp-2">{expert.bio}</p>

        {/* Rating & Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
            <span className="text-white font-medium">{expert.rating.toFixed(1)}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-400">
            <Briefcase className="h-4 w-4" />
            <span>{expert.totalHires} hires</span>
          </div>
          <div className="text-green-500">
            {expert.successRate.toFixed(0)}% success
          </div>
        </div>

        {/* Skills */}
        <div className="flex flex-wrap gap-2">
          {expert.skills.slice(0, 3).map((skill, idx) => (
            <Badge key={idx} variant="outline" className="bg-gray-800/50 border-gray-700 text-gray-300 text-xs">
              {skill}
            </Badge>
          ))}
          {expert.skills.length > 3 && (
            <Badge variant="outline" className="bg-gray-800/50 border-gray-700 text-gray-400 text-xs">
              +{expert.skills.length - 3}
            </Badge>
          )}
        </div>

        {/* Pricing */}
        <div className="pt-4 border-t border-gray-800 flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-white">${expert.currentPrice}</div>
            <div className="text-xs text-gray-400">
              {expert.pricingModel === 'per_hour' ? 'per hour' : 
               expert.pricingModel === 'per_task' ? 'per task' : 
               expert.pricingModel === 'monthly_subscription' ? 'per month' : 'custom'}
            </div>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            Hire Clone
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
