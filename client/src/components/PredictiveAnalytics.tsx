import React from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, TrendingUp, Brain, Target } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Prediction {
  metric: string;
  predictedValue: number;
  confidence: number;
  timeframe: string;
}

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
  expectedImpact: {
    metric: string;
    improvement: number;
  }[];
  reasoning: string;
  implementationSteps: string[];
}

interface PredictiveData {
  shortTermPredictions: Prediction[];
  longTermPredictions: Prediction[];
  recommendations: Recommendation[];
}

const PRIORITY_COLORS = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

export function PredictiveAnalytics({ agentId }: { agentId: number }) {
  const { data, isLoading, error } = useQuery<PredictiveData>({
    queryKey: [`/api/agent-predictions/${agentId}`],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-4 w-[250px]" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load predictive analytics. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No predictive data available</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Predictions Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Performance Predictions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Short-term Predictions */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Short-term Outlook</h3>
              <div className="space-y-4">
                {data.shortTermPredictions.map((prediction, index) => (
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
                    <div className="text-2xl font-bold">
                      {prediction.predictedValue.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Confidence: {(prediction.confidence * 100).toFixed(1)}%
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Long-term Predictions */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Long-term Projections</h3>
              <div className="space-y-4">
                {data.longTermPredictions.map((prediction, index) => (
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
                    <div className="text-2xl font-bold">
                      {prediction.predictedValue.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Confidence: {(prediction.confidence * 100).toFixed(1)}%
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Optimization Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="space-y-4">
            {data.recommendations.map((recommendation, index) => (
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
                    <div>
                      <h4 className="font-medium mb-2">Expected Impact</h4>
                      <div className="space-y-2">
                        {recommendation.expectedImpact.map((impact, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm"
                          >
                            <span>{impact.metric}</span>
                            <span className="font-medium text-green-600">
                              +{impact.improvement.toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Reasoning</h4>
                      <p className="text-sm text-muted-foreground">
                        {recommendation.reasoning}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Implementation Steps</h4>
                      <ol className="list-decimal list-inside space-y-1">
                        {recommendation.implementationSteps.map((step, idx) => (
                          <li key={idx} className="text-sm">
                            {step}
                          </li>
                        ))}
                      </ol>
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

export default PredictiveAnalytics;
