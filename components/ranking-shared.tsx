"use client"

import { Crown, Medal, Award, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Badge } from "@/components/ui/badge"

/** 1~3위에 아이콘, 나머지는 숫자를 표시합니다 */
export function RankIcon({ rank }: { rank: number }) {
  switch (rank) {
    case 1: return <Crown className="h-5 w-5 text-orange-500" />
    case 2: return <Medal className="h-5 w-5 text-gray-300" />
    case 3: return <Award className="h-5 w-5 text-amber-600" />
    default: return <span className="text-muted-foreground font-mono w-5 text-center">{rank}</span>
  }
}

/** ELO 변동값을 방향 아이콘과 함께 색상으로 표시합니다 */
export function ChangeDisplay({ change }: { change: number }) {
  if (change > 0)
    return (
      <span className="flex items-center justify-center gap-1 text-accent font-medium">
        <TrendingUp className="h-4 w-4" /><span>+{change}</span>
      </span>
    )
  if (change < 0)
    return (
      <span className="flex items-center justify-center gap-1 text-destructive font-medium">
        <TrendingDown className="h-4 w-4" /><span>{change}</span>
      </span>
    )
  return (
    <span className="flex items-center justify-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" /><span>0</span>
    </span>
  )
}

/** 연승/연패 배지를 표시합니다. 0이면 null을 반환합니다 */
export function StreakDisplay({ streak }: { streak: number }) {
  if (streak > 0)
    return (
      <Badge className="bg-accent/20 text-accent border-accent/30" variant="outline">
        {streak}연승
      </Badge>
    )
  if (streak < 0)
    return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30" variant="outline">
        {Math.abs(streak)}연패
      </Badge>
    )
  return null
}
