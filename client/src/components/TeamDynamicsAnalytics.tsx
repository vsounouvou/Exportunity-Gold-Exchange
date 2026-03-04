import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Users, TrendingUp, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface TeamMetrics {
  cohesion: number;
  communication: number;
  efficiency: number;
  innovation: number;
}

interface Prediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  confidence: number;
  timeframe: string;
  factors: {
    name: string;
    impact: number;
    trend: "positive" | "negative" | "neutral";
  }[];
}

interface Recommendation {
  action: string;
  expectedImpact: number;
  priority: "high" | "medium" | "low";
}

interface TeamAnalytics {
  currentMetrics: TeamMetrics;
  predictions: Prediction[];
  recommendations: Recommendation[];
  recentInteractions: {
    timestamp: string;
    type: string;
    sentiment: number;
    impact: number;
  }[];
}

const METRIC_LABELS = {
  cohesion: "Team Cohesion",
  communication: "Communication",
  efficiency: "Efficiency",
  innovation: "Innovation",
};

const PRIORITY_COLORS = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

export function TeamDynamicsAnalytics() {
  const { data: analytics, isLoading, error } = useQuery<TeamAnalytics>({
    queryKey: ["/api/team-dynamics"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
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
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load team dynamics analytics. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (!analytics) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No team dynamics data available</AlertDescription>
      </Alert>
    );
  }

  const radarData = Object.entries(analytics.currentMetrics).map(([key, value]) => ({
    metric: METRIC_LABELS[key as keyof TeamMetrics],
    value: value * 100,
  }));

  return (
    <div className="space-y-6">
      {/* Team Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Dynamics Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" />
                <PolarRadiusAxis domain={[0, 100]} />
                <Radar
                  name="Current Metrics"
                  dataKey="value"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.6}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Predictions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance Predictions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {analytics.predictions.map((prediction, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="border rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{prediction.metric}</span>
                  <Badge variant="secondary">{prediction.timeframe}</Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Current</span>
                    <span className="font-medium">
                      {(prediction.currentValue * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Predicted</span>
                    <span className="font-medium">
                      {(prediction.predictedValue * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">
                    Confidence: {(prediction.confidence * 100).toFixed(1)}%
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Improvement Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="space-y-4">
            {analytics.recommendations.map((recommendation, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border rounded-lg p-2"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        PRIORITY_COLORS[recommendation.priority]
                      }`}
                    />
                    <span className="font-medium">{recommendation.action}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <div className="space-y-4 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Expected Impact</span>
                      <span className="font-medium text-green-600">
                        +{(recommendation.expectedImpact * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

export default TeamDynamicsAnalytics;
