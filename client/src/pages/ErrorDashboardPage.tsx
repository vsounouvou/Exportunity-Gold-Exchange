import { ErrorVisualization } from "@/components/ErrorVisualization";

export function ErrorDashboardPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Error Analytics Dashboard</h1>
      <ErrorVisualization />
    </div>
  );
}

export default ErrorDashboardPage;
