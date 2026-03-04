import { TokenDashboard } from "@/components/TokenDashboard";
import { HeatmapVisualization } from "@/components/HeatmapVisualization";

export function TokenEconomyPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Token Economy Dashboard</h1>
      <TokenDashboard />
      <HeatmapVisualization />
    </div>
  );
}
