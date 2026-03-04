import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Star, Trophy, Crown, Info, Users, CheckCircle, Brain, Lightbulb, Compass } from "lucide-react";

interface AchievementDisplayProps {
  agentId: number;
}

type AchievementTier = keyof typeof TIER_ICONS;
type AchievementType = keyof typeof TYPE_ICONS;

type AgentApi = Agent & {
  experiencePoints?: number | null;
  level?: number | null;
};

type AchievementApi = {
  id: number;
  name: string;
  description: string;
  tier: string;
  type: string;
  agentAchievement: {
    unlockedAt?: string | null;
    progress?: unknown;
  } | null;
};

const TIER_ICONS = {
  bronze: <Award className="h-5 w-5 text-orange-600" />,
  silver: <Star className="h-5 w-5 text-gray-400" />,
  gold: <Trophy className="h-5 w-5 text-yellow-500" />,
  platinum: <Crown className="h-5 w-5 text-blue-500" />,
} as const;

const TIER_COLORS = {
  bronze: "bg-orange-600/20 text-orange-600",
  silver: "bg-gray-400/20 text-gray-400",
  gold: "bg-yellow-500/20 text-yellow-500",
  platinum: "bg-blue-500/20 text-blue-500",
} as const;

const TIER_BORDERS = {
  bronze: "border-orange-600/20",
  silver: "border-gray-400/20",
  gold: "border-yellow-500/20",
  platinum: "border-blue-500/20",
} as const;

const TYPE_ICONS = {
  interaction: <Users className="h-4 w-4" />,
  task: <CheckCircle className="h-4 w-4" />,
  collaboration: <Brain className="h-4 w-4" />,
  innovation: <Lightbulb className="h-4 w-4" />,
  leadership: <Compass className="h-4 w-4" />,
} as const;

const TYPE_COLORS = {
  interaction: "bg-purple-500/20 text-purple-500",
  task: "bg-green-500/20 text-green-500",
  collaboration: "bg-blue-500/20 text-blue-500",
  innovation: "bg-amber-500/20 text-amber-500",
  leadership: "bg-rose-500/20 text-rose-500",
} as const;

export function AchievementDisplay({ agentId }: AchievementDisplayProps) {
  const { data: agent } = useQuery<AgentApi>({
    queryKey: [`/api/agents/${agentId}`],
    enabled: !!agentId,
  });

  const { data: achievements = [] } = useQuery<AchievementApi[]>({
    queryKey: [`/api/agents/${agentId}/achievements`],
    enabled: !!agentId,
  });

  if (!agent) return null;

  // Calculate XP and level progress
  const baseXP = agent.experiencePoints || 0;
  const currentLevel = agent.level || 1;
  const xpToNextLevel = Math.pow(currentLevel, 2) * 100;
  const currentLevelXP = baseXP % xpToNextLevel;
  const experienceProgress = (currentLevelXP / xpToNextLevel) * 100;

  return (
    <div className="space-y-6">
      {/* Level and Experience */}
      <Card className="relative overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">Level {currentLevel}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Total XP: {baseXP}</p>
                    <p>Next level at: {xpToNextLevel} XP</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <span className="text-sm text-muted-foreground">
              {currentLevelXP} / {xpToNextLevel} XP
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Progress value={experienceProgress} className="h-2" />
            <p className="text-sm text-muted-foreground">
              {Math.ceil(xpToNextLevel - currentLevelXP)} XP until next level
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Achievements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Achievements</span>
            <Badge variant="secondary" className="ml-2">
              {achievements.filter(a => a.agentAchievement?.unlockedAt).length} / {achievements.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>
              {achievements.map((achievement) => {
                const tier = (Object.prototype.hasOwnProperty.call(TIER_ICONS, achievement.tier)
                  ? achievement.tier
                  : "bronze") as AchievementTier;

                const type = (Object.prototype.hasOwnProperty.call(TYPE_ICONS, achievement.type)
                  ? achievement.type
                  : "task") as AchievementType;

                const unlockedAt = achievement.agentAchievement?.unlockedAt || null;
                const isUnlocked = !!unlockedAt;
                const progress = achievement.agentAchievement?.progress as { current: number; required: number } | undefined;

                return (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`relative rounded-lg border p-4 transition-colors duration-200 
                      ${TIER_BORDERS[tier]} 
                      ${isUnlocked ? "bg-muted/50" : "opacity-50"}`}
                  >
                    <div className="flex items-center gap-3">
                      {TIER_ICONS[tier]}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium leading-none">
                            {achievement.name}
                          </h4>
                          <Badge variant="secondary" className={`${TYPE_COLORS[type]} flex items-center gap-1`}>
                            {TYPE_ICONS[type]}
                            <span className="capitalize">{type}</span>
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {achievement.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <Badge
                        variant="secondary"
                        className={`${TIER_COLORS[tier]}`}
                      >
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </Badge>
                      {isUnlocked && unlockedAt && (
                        <span className="text-sm text-muted-foreground">
                          {new Date(unlockedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {progress && !isUnlocked && (
                      <div className="mt-2 space-y-1">
                        <Progress
                          value={(progress.current / progress.required) * 100}
                          className="h-1.5"
                        />
                        <p className="text-xs text-muted-foreground text-right">
                          {progress.current} / {progress.required}
                        </p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AchievementDisplay;
