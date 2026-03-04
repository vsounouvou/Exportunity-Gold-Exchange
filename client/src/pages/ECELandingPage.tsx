import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTenant } from "@/lib/tenant";
import { 
  Shield, 
  Globe, 
  TrendingUp, 
  Truck, 
  CheckCircle2, 
  ArrowRight,
  Building2,
  Users,
  BarChart3,
  Settings,
  Lock,
  Gem,
  MapPin,
  FileCheck
} from "lucide-react";

const metrics = {
  totalRotations: 847,
  totalVolumeKg: 12450,
  totalValueUsd: 892000000,
  activeSuppliers: 156,
  activeBuyers: 43,
  countries: 12
};

const traceabilitySteps = [
  { icon: MapPin, title: "Verified Mine", description: "Government-recognized sources" },
  { icon: FileCheck, title: "National Assayer", description: "Official purity certification" },
  { icon: Truck, title: "BRINKS Logistics", description: "Secure worldwide transport" },
  { icon: CheckCircle2, title: "Delivered", description: "Full traceability guaranteed" }
];

const rolePreviewContent = {
  buyer: {
    title: "Buyer Experience",
    icon: Building2,
    description: "Request gold, receive competitive pricing, track shipments in real-time",
    features: [
      "Request specific quantities and purity levels",
      "Receive transparent pricing quotes",
      "Sign contracts digitally",
      "Track BRINKS shipments in real-time",
      "Access assay reports and compliance documents"
    ]
  },
  supplier: {
    title: "Supplier Experience",
    icon: Gem,
    description: "Declare inventory, upload documents, connect with global buyers",
    features: [
      "Declare gold inventory with weight and purity",
      "Upload mining licenses and government registration",
      "Track verification status",
      "Receive fair market pricing",
      "Access export workflow assistance"
    ]
  },
  shareholder: {
    title: "Shareholder Dashboard",
    icon: BarChart3,
    description: "Monitor performance, margins, and country exposure",
    features: [
      "View rotation summaries",
      "Access gross and net margin reports",
      "Analyze country exposure and risk",
      "Track platform growth metrics",
      "Receive automated performance reports"
    ]
  },
  admin: {
    title: "Admin Console",
    icon: Settings,
    description: "Manage suppliers, approve buyers, oversee operations",
    features: [
      "Upload government supplier lists",
      "Approve buyer onboarding",
      "Validate proof-of-funds",
      "Monitor compliance workflows",
      "Access comprehensive audit logs"
    ]
  }
};

type RoleKey = keyof typeof rolePreviewContent;

function RolePreviewDialog({ role }: { role: RoleKey }) {
  const content = rolePreviewContent[role];
  const Icon = content.icon;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-auto py-4 px-6 flex-1 min-w-[200px] bg-gray-800/50 border-amber-500/30 hover:bg-amber-500/10 hover:border-amber-500">
          <div className="flex flex-col items-center gap-2">
            <Icon className="h-8 w-8 text-amber-500" />
            <span className="text-white font-medium">{content.title}</span>
          </div>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl text-white">
            <Icon className="h-6 w-6 text-amber-500" />
            {content.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-gray-400">{content.description}</p>
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-white">Key Features:</h4>
            <ul className="space-y-2">
              {content.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                  <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <Link href="/login">
            <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold">
              Sign In to Access
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ECELandingPage() {
  const { tenant, brand } = useTenant();
  const isGoldTenant = tenant.key === "bdo";
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950">
      <header className="border-b border-gray-800/50 backdrop-blur-sm sticky top-0 z-50 bg-gray-950/80">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Gem className="h-6 w-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Exportunity</h1>
              <p className="text-xs text-gray-500">Commodities Exchange</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-gray-300 hover:text-white">
                Sign In
              </Button>
            </Link>
            <Link href="/login">
              <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                Enter Platform
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center space-y-6">
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 px-4 py-1">
            Exportunity Commodities Exchange
          </Badge>
          <h2 className="text-4xl md:text-6xl font-bold text-white leading-tight">
            Transparency in <span className="text-amber-500">African Gold</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            {isGoldTenant
              ? `Gold trading via ${brand.name} as merchant-of-record, with government-verified supply sources,`
              : `Marketplace trading via ${brand.name}, with verified suppliers and compliant sourcing workflows,`}
            national assayer certification, and secured logistics.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-6">
            <Link href="/login">
              <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-lg px-8">
                Start Trading
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800 text-lg px-8">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Rotations", value: metrics.totalRotations.toLocaleString(), icon: TrendingUp },
            { label: "Volume (kg)", value: metrics.totalVolumeKg.toLocaleString(), icon: Gem },
            { label: "Total Value", value: `$${(metrics.totalValueUsd / 1000000).toFixed(0)}M`, icon: BarChart3 },
            { label: "Verified Suppliers", value: metrics.activeSuppliers.toString(), icon: CheckCircle2 },
            { label: "Active Clients", value: metrics.activeBuyers.toString(), icon: Building2 },
            { label: "Countries", value: metrics.countries.toString(), icon: Globe }
          ].map((metric, idx) => (
            <Card key={idx} className="bg-gray-800/30 border-gray-700/50">
              <CardContent className="p-4 text-center">
                <metric.icon className="h-5 w-5 text-amber-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{metric.value}</div>
                <div className="text-xs text-gray-500">{metric.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-white mb-4">Why Exportunity?</h3>
          <p className="text-gray-400 max-w-2xl mx-auto">
            We bring unprecedented transparency to one of the world's most opaque supply chains.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="bg-gray-800/30 border-gray-700/50">
            <CardHeader>
              <Shield className="h-10 w-10 text-amber-500 mb-2" />
              <CardTitle className="text-white">Government Verified</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400">
              Every supplier is cross-referenced with official government lists. 
              Only registered mines and bureaus can supply through our platform.
            </CardContent>
          </Card>
          <Card className="bg-gray-800/30 border-gray-700/50">
            <CardHeader>
              <FileCheck className="h-10 w-10 text-amber-500 mb-2" />
              <CardTitle className="text-white">National Assayer</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400">
              Every gram is tested by official national assayers. 
              The assay report is the ground truth for purity and weight.
            </CardContent>
          </Card>
          <Card className="bg-gray-800/30 border-gray-700/50">
            <CardHeader>
              <Lock className="h-10 w-10 text-amber-500 mb-2" />
              <CardTitle className="text-white">BRINKS Security</CardTitle>
            </CardHeader>
            <CardContent className="text-gray-400">
              All shipments are handled by BRINKS - the world's most trusted 
              secure logistics provider for valuable goods.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-white mb-4">Full Traceability Chain</h3>
          <p className="text-gray-400 max-w-2xl mx-auto">
            From verified mine to final delivery - every step is tracked and documented.
          </p>
        </div>
        <div className="relative">
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500/20 via-amber-500/50 to-amber-500/20 -translate-y-1/2" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 relative">
            {traceabilitySteps.map((step, idx) => (
              <div key={idx} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-gray-800 border-2 border-amber-500 flex items-center justify-center mb-4 relative z-10">
                  <step.icon className="h-7 w-7 text-amber-500" />
                </div>
                <h4 className="text-white font-semibold mb-1">{step.title}</h4>
                <p className="text-sm text-gray-500">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-white mb-4">Preview Each Experience</h3>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Whether you're a buyer, supplier, shareholder, or administrator - 
            explore what Exportunity offers for your role.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <RolePreviewDialog role="buyer" />
          <RolePreviewDialog role="supplier" />
          <RolePreviewDialog role="shareholder" />
          <RolePreviewDialog role="admin" />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-20">
        <Card className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border-amber-500/30">
          <CardContent className="p-12 text-center">
            <h3 className="text-3xl font-bold text-white mb-4">
              Ready to Transform Your Gold Trading?
            </h3>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Join the platform that major global buyers trust for verified, 
              transparent, and secure African commodities.
            </p>
            <Link href="/login">
              <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-lg px-12">
                Enter Platform
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-gray-800/50 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
                <Gem className="h-4 w-4 text-black" />
              </div>
              <span className="text-gray-400 text-sm">
                Exportunity Commodities Exchange &copy; 2025
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-500" />
                Government Verified
              </span>
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-500" />
                BRINKS Secured
              </span>
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-amber-500" />
                Global Reach
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
