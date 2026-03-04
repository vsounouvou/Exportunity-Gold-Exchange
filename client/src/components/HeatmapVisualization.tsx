import React, { useMemo } from 'react';
import { scaleLinear } from '@visx/scale';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

interface DensityScore {
  timestamp: string;
  score: number;
  meetingCount: number;
  totalDuration: number;
  participantCount: number;
}

interface HeatmapData {
  densityScores: DensityScore[];
  insights: {
    peakHours: string[];
    quietHours: string[];
    recommendations: string[];
  };
  statistics: {
    averageDailyMeetings: number;
    averageDuration: number;
    participantDistribution: Record<string, number>;
  };
}

const defaultMargin = { top: 10, left: 100, right: 20, bottom: 100 };

// Color scale for the heatmap
const colors = {
  minimum: '#F3F4F6',
  maximum: '#8884D8'
};

export function HeatmapVisualization() {
  const { data, isLoading, error } = useQuery<HeatmapData>({
    queryKey: ["/api/calendar-heatmap"],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const width = 800;
  const height = 400;

  const {
    xScale,
    yScale,
    colorScale,
    cells
  } = useMemo(() => {
    if (!data) return { xScale: null, yScale: null, colorScale: null, cells: [] };

    const timestamps = [...new Set(data.densityScores.map(d => 
      format(new Date(d.timestamp), 'HH:mm')
    ))].sort();

    const dates = [...new Set(data.densityScores.map(d => 
      format(new Date(d.timestamp), 'yyyy-MM-dd')
    ))].sort();

    const xScale = scaleLinear({
      domain: [0, timestamps.length],
      range: [0, width - defaultMargin.left - defaultMargin.right]
    });

    const yScale = scaleLinear({
      domain: [0, dates.length],
      range: [0, height - defaultMargin.top - defaultMargin.bottom]
    });

    const colorScale = scaleLinear({
      domain: [0, Math.max(...data.densityScores.map(d => d.score))],
      range: [colors.minimum, colors.maximum]
    });

    // Transform density scores into heatmap cells
    const cells = data.densityScores.map(score => {
      const time = format(new Date(score.timestamp), 'HH:mm');
      const date = format(new Date(score.timestamp), 'yyyy-MM-dd');

      return {
        value: score.score,
        x: xScale(timestamps.indexOf(time)),
        y: yScale(dates.indexOf(date)),
        width: xScale.range()[1] / timestamps.length,
        height: yScale.range()[1] / dates.length,
        time,
        date,
        meetingCount: score.meetingCount,
        totalDuration: score.totalDuration,
        participantCount: score.participantCount,
      };
    });

    return { xScale, yScale, colorScale, cells, timestamps, dates };
  }, [data, width, height]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meeting Density Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meeting Density Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-destructive">Failed to load heatmap data</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meeting Density Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div style={{ width, height }} className="relative">
            <svg width={width} height={height}>
              <g transform={`translate(${defaultMargin.left}, ${defaultMargin.top})`}>
                {/* Render heatmap cells */}
                {cells.map((cell, i) => (
                  <motion.rect
                    key={`${cell.date}-${cell.time}`}
                    initial={{ opacity: 0 }}
                    animate={{ 
                      opacity: 1,
                      fill: colorScale!(cell.value)
                    }}
                    transition={{ duration: 0.5 }}
                    x={cell.x}
                    y={cell.y}
                    width={cell.width - 2}
                    height={cell.height - 2}
                    rx={2}
                    className="cursor-pointer hover:opacity-80"
                  >
                    <title>{`Date: ${cell.date} | Time: ${cell.time} | Meetings: ${cell.meetingCount} | Duration: ${cell.totalDuration}min | Participants: ${cell.participantCount}`}</title>
                  </motion.rect>
                ))}
              </g>
            </svg>
          </div>

          {/* Display insights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <h4 className="font-semibold mb-2">Peak Hours</h4>
              <ul className="list-disc list-inside">
                {data.insights.peakHours.map((hour, i) => (
                  <li key={i}>{hour}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Quiet Hours</h4>
              <ul className="list-disc list-inside">
                {data.insights.quietHours.map((hour, i) => (
                  <li key={i}>{hour}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Recommendations</h4>
              <ul className="list-disc list-inside">
                {data.insights.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Display statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground">Average Daily Meetings</p>
              <p className="text-2xl font-semibold">{data.statistics.averageDailyMeetings.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Average Duration</p>
              <p className="text-2xl font-semibold">{data.statistics.averageDuration.toFixed(0)} min</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Meeting Sizes</p>
              <div className="flex gap-2">
                {Object.entries(data.statistics.participantDistribution).map(([size, count]) => (
                  <div key={size} className="text-sm">
                    <span className="font-medium">{size}:</span> {count}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default HeatmapVisualization;
