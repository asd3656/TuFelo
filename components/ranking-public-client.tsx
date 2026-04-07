"use client"

import { useMemo, useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Crown, Medal, Award, TrendingUp, Search, Trophy, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { MemberForRanking, MatchForRanking, Race, Tier, Season, SeasonRankingEntry } from "@/lib/types/tufelo"

interface RankingPublicClientProps {
  members: MemberForRanking[]
  allMatches: MatchForRanking[]
  seasons: Season[]
  currentSeason: Season | null
  pastSeasonRankings: Record<string, SeasonRankingEntry[]>
}

interface ComputedPlayer {
  id: string
  rank: number
  name: string
  race: Race
  tier: Tier
  elo: number
  wins: number
  losses: number
  streak: number
  change: number
  rankChange: number
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function computeRankedPlayers(
  members: MemberForRanking[],
  allMatches: MatchForRanking[],
  filterSeasonId: string,
  filterRace: string,
  filterTier: string,
  pastSeasonRankings: Record<string, SeasonRankingEntry[]>,
): ComputedPlayer[] {
  const eligibleMembers = members.filter(
    (m) =>
      (filterRace === "__all__" || m.race === filterRace) &&
      (filterTier === "__all__" || m.tier === Number(filterTier)),
  )

  if (filterSeasonId !== "__current__") {
    const entries = pastSeasonRankings[filterSeasonId] ?? []
    return entries
      .filter(
        (e) =>
          (filterRace === "__all__" || e.memberRace === filterRace) &&
          (filterTier === "__all__" || e.memberTier === Number(filterTier)),
      )
      .map((e, i) => ({
        id: e.memberId,
        rank: i + 1,
        name: e.memberName,
        race: e.memberRace,
        tier: e.memberTier,
        elo: e.finalElo,
        wins: e.finalWins,
        losses: e.finalLosses,
        streak: 0,
        change: 0,
        rankChange: 0,
      }))
  }

  const lastChangeMap = new Map<string, number>()
  for (const m of allMatches) {
    if (!lastChangeMap.has(m.player1Id) && m.player1EloDelta !== null)
      lastChangeMap.set(m.player1Id, m.player1EloDelta)
    if (!lastChangeMap.has(m.player2Id) && m.player2EloDelta !== null)
      lastChangeMap.set(m.player2Id, m.player2EloDelta)
  }

  const today = getTodayDate()
  const recentDeltaMap = new Map<string, number>()
  for (const m of allMatches) {
    if (m.playedDate < today) continue
    if (m.player1EloDelta !== null)
      recentDeltaMap.set(m.player1Id, (recentDeltaMap.get(m.player1Id) ?? 0) + m.player1EloDelta)
    if (m.player2EloDelta !== null)
      recentDeltaMap.set(m.player2Id, (recentDeltaMap.get(m.player2Id) ?? 0) + m.player2EloDelta)
  }

  const sorted = eligibleMembers
    .map((m) => ({
      id: m.id,
      name: m.name,
      race: m.race,
      tier: m.tier,
      elo: m.elo,
      wins: m.wins,
      losses: m.losses,
      streak: m.streak,
      change: lastChangeMap.get(m.id) ?? 0,
      rankChange: 0,
      rank: 0,
    }))
    .sort((a, b) => b.elo - a.elo)

  const oldRankSorted = [...sorted]
    .map((p) => ({ id: p.id, elo: p.elo - (recentDeltaMap.get(p.id) ?? 0) }))
    .sort((a, b) => b.elo - a.elo)
  const oldRankMap = new Map(oldRankSorted.map((p, i) => [p.id, i + 1]))

  return sorted.map((p, i) => ({
    ...p,
    rank: i + 1,
    rankChange: (oldRankMap.get(p.id) ?? i + 1) - (i + 1),
  }))
}

const raceColors: Record<string, string> = {
  T: "bg-blue-600/20 text-blue-400 border-blue-500/30",
  P: "bg-amber-600/20 text-amber-400 border-amber-500/30",
  Z: "bg-red-600/20 text-red-400 border-red-500/30",
}
const raceNames: Record<string, string> = { T: "Terran", P: "Protoss", Z: "Zerg" }

const tierColors: Record<number, string> = {
  1: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  2: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  3: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  4: "bg-green-500/20 text-green-400 border-green-500/30",
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1: return <Crown className="h-5 w-5 text-yellow-400" />
    case 2: return <Medal className="h-5 w-5 text-gray-300" />
    case 3: return <Award className="h-5 w-5 text-amber-600" />
    default: return <span className="text-muted-foreground font-mono w-5 text-center">{rank}</span>
  }
}

function StreakDisplay({ streak }: { streak: number }) {
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

function formatSeasonDateRange(season: Season) {
  const start = season.startDate.replace(/-/g, ".").slice(0, 7)
  if (!season.endDate) return `${start} ~ `
  const end = season.endDate.replace(/-/g, ".").slice(0, 7)
  return `${start} ~ ${end}`
}

export function RankingPublicClient({
  members,
  allMatches,
  seasons,
  currentSeason,
  pastSeasonRankings,
}: RankingPublicClientProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filterSeasonId, setFilterSeasonId] = useState("__current__")
  const [filterRace, setFilterRace] = useState("__all__")
  const [filterTier, setFilterTier] = useState("__all__")

  const pastSeasons = useMemo(() => seasons.filter((s) => s.endDate !== null), [seasons])

  const rankedPlayers = useMemo(
    () => computeRankedPlayers(members, allMatches, filterSeasonId, filterRace, filterTier, pastSeasonRankings),
    [members, allMatches, filterSeasonId, filterRace, filterTier, pastSeasonRankings],
  )

  const filteredPlayers = useMemo(
    () => rankedPlayers.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [rankedPlayers, searchQuery],
  )

  const isPastSeason = filterSeasonId !== "__current__"
  const top = rankedPlayers[0] ?? null
  const topGainer = rankedPlayers.length
    ? rankedPlayers.reduce((mx, p) => (p.rankChange > mx.rankChange ? p : mx), rankedPlayers[0])
    : null

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <header className="mb-10">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-violet-500" />
              <h1 className="text-3xl font-bold text-foreground">ELO Ranking</h1>
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
            <p className="text-sm text-muted-foreground">
              {top != null ? `${top.elo} ELO` : ""}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-6 w-6 text-accent" />
              <span className="text-sm text-muted-foreground">최다 상승 (자정 기준)</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{topGainer?.name ?? "—"}</p>
            <p className="text-sm text-accent">
              {topGainer && topGainer.rankChange > 0 && !isPastSeason
                ? `순위 ${topGainer.rankChange}위 상승`
                : "—"}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <Award className="h-6 w-6 text-violet-500" />
              <span className="text-sm text-muted-foreground">총 선수</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{rankedPlayers.length}</p>
            <p className="text-sm text-muted-foreground">명 {isPastSeason ? "(시즌 참가)" : "등록됨"}</p>
          </div>
        </section>

        <section className="mb-6 space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="선수 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Select value={filterSeasonId} onValueChange={setFilterSeasonId}>
              <SelectTrigger className="w-52 bg-card border-border text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__current__">
                  {currentSeason ? `${currentSeason.name} (현재)` : "현재 시즌"}
                </SelectItem>
                {pastSeasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({formatSeasonDateRange(s)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterTier} onValueChange={setFilterTier}>
              <SelectTrigger className="w-36 bg-card border-border text-foreground">
                <SelectValue placeholder="전체 티어" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체 티어</SelectItem>
                <SelectItem value="1">1티어</SelectItem>
                <SelectItem value="2">2티어</SelectItem>
                <SelectItem value="3">3티어</SelectItem>
                <SelectItem value="4">4티어</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterRace} onValueChange={setFilterRace}>
              <SelectTrigger className="w-36 bg-card border-border text-foreground">
                <SelectValue placeholder="전체 종족" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체 종족</SelectItem>
                <SelectItem value="T">Terran</SelectItem>
                <SelectItem value="P">Protoss</SelectItem>
                <SelectItem value="Z">Zerg</SelectItem>
              </SelectContent>
            </Select>

            {(filterSeasonId !== "__current__" || filterTier !== "__all__" || filterRace !== "__all__") && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setFilterSeasonId("__current__")
                  setFilterTier("__all__")
                  setFilterRace("__all__")
                }}
              >
                필터 초기화
              </Button>
            )}
          </div>
          {isPastSeason && (
            <p className="text-xs text-amber-400">
              과거 시즌 보기 — 시즌 종료 시점의 최종 순위입니다.
            </p>
          )}
        </section>

        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold w-16 text-center">순위</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">선수명</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">티어</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">종족</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">연속</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => (
                  <TableRow
                    key={player.id}
                    className={`border-border hover:bg-secondary/50 transition-colors ${player.rank <= 3 ? "bg-secondary/30" : ""}`}
                  >
                    <TableCell className="text-center">
                      <div className="flex justify-center">{getRankIcon(player.rank)}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`font-semibold ${player.rank === 1 ? "text-yellow-400" : "text-foreground"}`}>
                        {player.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-xs font-semibold px-1.5 py-0 ${tierColors[player.tier]}`}>
                        {player.tier}티어
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={raceColors[player.race]}>
                        {raceNames[player.race]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <StreakDisplay streak={player.streak} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredPlayers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-lg">
                {isPastSeason ? "해당 시즌 랭킹 기록이 없습니다" : "검색 결과가 없습니다"}
              </p>
              <p className="text-sm">필터 조건을 확인해 주세요</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
