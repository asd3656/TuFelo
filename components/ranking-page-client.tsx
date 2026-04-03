"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Crown, Medal, Award, TrendingUp, TrendingDown, Minus, Search, Trophy, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface RankingPlayer {
  id: string
  rank: number
  name: string
  race: "T" | "P" | "Z"
  elo: number
  change: number
  wins: number
  losses: number
  streak: number
}

const raceColors: Record<string, string> = {
  T: "bg-blue-600/20 text-blue-400 border-blue-500/30",
  P: "bg-amber-600/20 text-amber-400 border-amber-500/30",
  Z: "bg-red-600/20 text-red-400 border-red-500/30",
}

const raceNames: Record<string, string> = {
  T: "Terran",
  P: "Protoss",
  Z: "Zerg",
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="h-5 w-5 text-yellow-400" />
    case 2:
      return <Medal className="h-5 w-5 text-gray-300" />
    case 3:
      return <Award className="h-5 w-5 text-amber-600" />
    default:
      return <span className="text-muted-foreground font-mono w-5 text-center">{rank}</span>
  }
}

function getChangeDisplay(change: number) {
  if (change > 0) {
    return (
      <span className="flex items-center justify-center gap-1 text-accent font-medium">
        <TrendingUp className="h-4 w-4" />
        <span>+{change}</span>
      </span>
    )
  }
  if (change < 0) {
    return (
      <span className="flex items-center justify-center gap-1 text-destructive font-medium">
        <TrendingDown className="h-4 w-4" />
        <span>{change}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center justify-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" />
      <span>0</span>
    </span>
  )
}

function getStreakDisplay(streak: number) {
  if (streak > 0) {
    return (
      <Badge className="bg-accent/20 text-accent border-accent/30" variant="outline">
        {streak}연승
      </Badge>
    )
  }
  if (streak < 0) {
    return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30" variant="outline">
        {Math.abs(streak)}연패
      </Badge>
    )
  }
  return null
}

interface RankingPageClientProps {
  players: RankingPlayer[]
}

export function RankingPageClient({ players }: RankingPageClientProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredPlayers = players.filter((player) =>
    player.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const top = players[0]
  const topGainer = players.length
    ? players.reduce((max, p) => (p.change > max.change ? p : max), players[0])
    : null

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <header className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold text-foreground">ELO Ranking Board</h1>
            </div>
          </div>
          <p className="text-muted-foreground ml-14">클랜 내 선수들의 ELO 점수 기반 랭킹</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <Crown className="h-6 w-6 text-yellow-400" />
              <span className="text-sm text-muted-foreground">현재 1위</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{top?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">{top != null ? `${top.elo} ELO` : ""}</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-6 w-6 text-accent" />
              <span className="text-sm text-muted-foreground">최다 상승 (최근 경기)</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{topGainer?.name ?? "—"}</p>
            <p className="text-sm text-accent">
              {topGainer && topGainer.change > 0 ? `+${topGainer.change} pts` : "—"}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <Award className="h-6 w-6 text-primary" />
              <span className="text-sm text-muted-foreground">총 선수</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{players.length}</p>
            <p className="text-sm text-muted-foreground">명 등록됨</p>
          </div>
        </section>

        <section className="mb-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="선수 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </section>

        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold w-16 text-center">순위</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">선수명</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">종족</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-right">ELO</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">변동</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">전적</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">승률</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">연속</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => {
                  const total = player.wins + player.losses
                  const winRate = total > 0 ? ((player.wins / total) * 100).toFixed(1) : "0.0"

                  return (
                    <TableRow
                      key={player.id}
                      className={`border-border hover:bg-secondary/50 transition-colors ${
                        player.rank <= 3 ? "bg-secondary/30" : ""
                      }`}
                    >
                      <TableCell className="text-center">
                        <div className="flex justify-center">{getRankIcon(player.rank)}</div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`font-semibold ${player.rank === 1 ? "text-yellow-400" : "text-foreground"}`}
                        >
                          {player.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={raceColors[player.race]}>
                          {raceNames[player.race]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono font-bold text-primary text-lg">{player.elo}</span>
                      </TableCell>
                      <TableCell className="text-center">{getChangeDisplay(player.change)}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">
                          <span className="text-accent">{player.wins}W</span>
                          <span className="text-muted-foreground mx-1">/</span>
                          <span className="text-destructive">{player.losses}L</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`font-medium ${
                            parseFloat(winRate) >= 60
                              ? "text-accent"
                              : parseFloat(winRate) >= 50
                                ? "text-foreground"
                                : "text-destructive"
                          }`}
                        >
                          {winRate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">{getStreakDisplay(player.streak)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {filteredPlayers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-lg">검색 결과가 없습니다</p>
              <p className="text-sm">선수 이름을 확인해주세요</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
