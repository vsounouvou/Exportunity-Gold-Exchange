import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateCompanyDialogEnhanced } from "@/components/CreateCompanyDialogEnhanced";
import { 
  Building2, Plus, Search, Filter, TrendingUp, DollarSign, 
  Users, BarChart3, Globe, FileText, Target, Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

const formatSector = (sector: string): string => {
  const sectorMap: Record<string, string> = {
    'trade_export': 'Trade & Export',
    'gold_metals': 'Gold & Metals',
    'education': 'Education',
    'logistics': 'Logistics',
    'construction': 'Construction',
    'architecture': 'Architecture',
    'technology': 'Technology',
    'retail': 'Retail',
    'media': 'Media',
    'agriculture': 'Agriculture',
    'real_estate': 'Real Estate',
    'other': 'Other'
  };
  return sectorMap[sector] || sector;
};

interface CompanyListItem {
  id: number;
  name: string;
  description: string;
  logo?: string;
  country: string;
  legalType: string;
  primarySector: string;
  totalRevenue: number;
  totalProfit: number;
  totalExpenses: number;
  autonomyLevel: string;
  themeColor: string;
  agentCount?: number;
}

export function CompanyListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [legalTypeFilter, setLegalTypeFilter] = useState<string>("all");

  const { data: companies = [], isLoading } = useQuery<CompanyListItem[]>({
    queryKey: ['/api/companies']
  });

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = !searchQuery || 
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSector = sectorFilter === "all" || company.primarySector === sectorFilter;
    const matchesCountry = countryFilter === "all" || company.country === countryFilter;
    const matchesLegalType = legalTypeFilter === "all" || company.legalType === legalTypeFilter;

    return matchesSearch && matchesSector && matchesCountry && matchesLegalType;
  });

  const sectors = [...new Set(companies.map(c => c.primarySector))].filter(Boolean);
  const countries = [...new Set(companies.map(c => c.country))].filter(Boolean);
  const legalTypes = [...new Set(companies.map(c => c.legalType))].filter(Boolean);

  const totalRevenue = companies.reduce((sum, c) => sum + (c.totalRevenue || 0), 0);
  const totalProfit = companies.reduce((sum, c) => sum + (c.totalProfit || 0), 0);
  const totalExpenses = companies.reduce((sum, c) => sum + (c.totalExpenses || 0), 0);
  const totalAgents = companies.reduce((sum, c) => sum + (c.agentCount || 0), 0);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-800 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 pb-32 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            Companies
          </h1>
          <p className="text-gray-400 mt-1">
            Manage {companies.length} {companies.length === 1 ? 'company' : 'companies'} across your portfolio
          </p>
        </div>
        <CreateCompanyDialogEnhanced />
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Revenue</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${totalRevenue.toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Profit</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${totalProfit.toLocaleString()}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Expenses</p>
                <p className="text-2xl font-bold text-white mt-1">
                  ${totalExpenses.toLocaleString()}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Agents</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {totalAgents.toLocaleString()}
                </p>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-gray-800 border-gray-700 text-white"
              />
            </div>

            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All Sectors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sectors</SelectItem>
                {sectors.map(sector => (
                  <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {countries.map(country => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={legalTypeFilter} onValueChange={setLegalTypeFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All Legal Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Legal Types</SelectItem>
                {legalTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(searchQuery || sectorFilter !== "all" || countryFilter !== "all" || legalTypeFilter !== "all") && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {filteredCompanies.length} results
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSectorFilter("all");
                  setCountryFilter("all");
                  setLegalTypeFilter("all");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Companies Grid */}
      {filteredCompanies.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="pt-12 pb-12 text-center">
            <Building2 className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg mb-2">No companies found</p>
            <p className="text-gray-500 text-sm mb-4">
              Try adjusting your filters or create a new company
            </p>
            <CreateCompanyDialogEnhanced />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompanies.map((company) => {
            const profitMargin = company.totalRevenue > 0 
              ? ((company.totalProfit / company.totalRevenue) * 100).toFixed(1) 
              : '0';

            return (
              <Link key={company.id} href={`/company?id=${company.id}`}>
                <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-all cursor-pointer group">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div 
                        className="h-12 w-12 rounded-lg flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: company.themeColor }}
                      >
                        {company.logo ? (
                          <img 
                            src={company.logo} 
                            alt={company.name} 
                            className="h-full w-full object-cover rounded-lg" 
                          />
                        ) : (
                          company.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-xs">
                          {company.legalType}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "text-xs",
                            company.autonomyLevel === 'high' && "bg-green-900/30 text-green-400",
                            company.autonomyLevel === 'medium' && "bg-yellow-900/30 text-yellow-400",
                            company.autonomyLevel === 'low' && "bg-red-900/30 text-red-400"
                          )}
                        >
                          {company.autonomyLevel} autonomy
                        </Badge>
                      </div>
                    </div>
                    <CardTitle className="text-white group-hover:text-blue-400 transition-colors">
                      {company.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 min-h-[40px]">
                      {company.description || "No description available"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Company Details */}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {company.country}
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {formatSector(company.primarySector)}
                      </span>
                    </div>

                    {/* Financial Metrics */}
                    <div className="space-y-2 pt-2 border-t border-gray-800">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Revenue</span>
                        <span className="text-white font-medium">
                          ${company.totalRevenue.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Profit</span>
                        <span className={cn(
                          "font-medium",
                          company.totalProfit >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          ${company.totalProfit.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">Margin</span>
                        <span className="text-white font-medium">{profitMargin}%</span>
                      </div>
                    </div>

                    {/* Agent Count */}
                    {company.agentCount !== undefined && (
                      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                        <span className="text-sm text-gray-400 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Agents
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {company.agentCount}
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
