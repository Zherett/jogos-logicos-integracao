import React from "react";
import {
  Award,
  Bookmark,
  Bot,
  Brain,
  CheckCircle,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  Crown,
  Flag,
  Flame,
  Gem,
  Heart,
  Hourglass,
  Lightbulb,
  Medal,
  Puzzle,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  Zap,
} from "lucide-react";

const MEDAL_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Award,
  Bookmark,
  Bot,
  Brain,
  CheckCircle,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  Crown,
  Flag,
  Flame,
  Gem,
  Heart,
  Hourglass,
  Lightbulb,
  Medal,
  Puzzle,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  Zap,
};

interface Props {
  name: string;
  className?: string;
}

export function MedalIcon({ name, className = "h-5 w-5" }: Props) {
  const IconComponent = MEDAL_ICON_MAP[name] || Medal;
  return <IconComponent className={className} />;
}
