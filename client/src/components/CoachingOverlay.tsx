import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Brain, TrendingUp, Award } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion, AnimatePresence } from "framer-motion";

interface CoachingInsight {
  type: 'strength' | 'improvement' | 'opportunity';
  title: string;
  description: string;
  actionItems: string[];
  confidence: number;
}

interface AgentCoaching {
  agentId: number;
  insights: CoachingInsight[];
  lastUpdated: string;
  performanceTrend: {
    metric: string;
    change: number;
    recommendation: string;
  }[];
}

export function CoachingOverlay({ agentId }: { agentId: number }) {
  const { data: coaching, isLoading, error } = useQuery<AgentCoaching>({
    queryKey: [`/api/agent-coaching/${agentId}`],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-4 w-[200px]" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load coaching insights. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (!coaching) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No coaching data available</AlertDescription>
      </Alert>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="space-y-4"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Performance Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {coaching.insights.map((insight, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="border-l-4 border-primary p-4 bg-muted/50 rounded-r-lg"
                >
                  <h3 className="font-semibold text-lg mb-2">{insight.title}</h3>
                  <p className="text-muted-foreground mb-4">{insight.description}</p>
                  {insight.actionItems.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Recommended Actions:</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {insight.actionItems.map((action, idx) => (
                          <li key={idx} className="text-sm">{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {coaching.performanceTrend.map((trend, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {trend.change >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingUp className="h-4 w-4 text-red-500 transform rotate-180" />
                  )}
                  {trend.metric}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">
                  {trend.change >= 0 ? "+" : ""}
                  {trend.change}%
                </div>
                <p className="text-sm text-muted-foreground">
                  {trend.recommendation}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-right">
          Last updated: {new Date(coaching.lastUpdated).toLocaleString()}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default CoachingOverlay;
