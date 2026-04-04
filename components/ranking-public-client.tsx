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
import { MATCH_TYPES } from "@/lib/types/tufelo"
import type { MemberForRanking, MatchForRanking, Race, Tier } from "@/lib/types/tufelo"

interface RankingPublicClientProps {
  members: MemberForRanking[]
  allMatches: MatchForRanking[]
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
}

function computeStreak(memberId: string, matches: MatchForRanking[]): number {
  let streak = 0
  for (const m of matches) {
    const involved = m.player1Id === memberId || m.player2Id === memberId
    if (!involved) continue
    const won = m.winnerId === memberId
    if (streak === 0) {
      streak = won ? 1 : -1
    } else if (streak > 0 && won) {
      streak++
    } else if (streak < 0 && !won) {
      streak--
    } else {
      break
    }
  }
  return streak
}

function computeRankedPlayers(
  members: MemberForRanking[],
  allMatches: MatchForRanking[],
  filterMatchType: string,
  filterRace: string,
  filterTier: string,
): ComputedPlayer[] {
  const eligibleMembers = members.filter(
    (m) =>
      (filterRace === "__all__" || m.race === filterRace) &&
      (filterTier === "__all__" || m.tier === Number(filterTier)),
  )

  const isSeasonFilter = filterMatchType !== "__all__"
  const relevantMatches = isSeasonFilter
    ? allMatches.filter((m) => m.matchType === filterMatchType)
    : allMatches

  if (!isSeasonFilter) {
    const lastChangeMap = new Map<string, number>()
    for (const m of allMatches) {
      if (!lastChangeMap.has(m.player1Id) && m.player1EloDelta !== null)
        lastChangeMap.set(m.player1Id, m.player1EloDelta)
      if (!lastChangeMap.has(m.player2Id) && m.player2EloDelta !== null)
        lastChangeMap.set(m.player2Id, m.player2EloDelta)
    }
    return eligibleMembers
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
        rank: 0,
      }))
      .sort((a, b) => b.elo - a.elo)
      .map((p, i) => ({ ...p, rank: i + 1 }))
  }

  const playerMatchesMap = new Map<string, MatchForRanking[]>()
  for (const m of relevantMatches) {
    const add = (id: string) => {
      if (!playerMatchesMap.has(id)) playerMatchesMap.set(id, [])
      playerMatchesMap.get(id)!.push(m)
    }
    add(m.player1Id)
    add(m.player2Id)
  }

  return eligibleMembers
    .map((m) => {
      const myMatches = playerMatchesMap.get(m.id) ?? []
      if (myMatches.length === 0) return null

      let wins = 0
      let losses = 0
      let totalDelta = 0
      let lastDelta = 0
      let lastDeltaSet = false

      for (const match of myMatches) {
        const isP1 = match.player1Id === m.id
        const won = match.winnerId === m.id
        won ? wins++ : losses++
        const delta = isP1 ? match.player1EloDelta : match.player2EloDelta
        if (delta !== null) {
          totalDelta += delta
          if (!lastDeltaSet) {
            lastDelta = delta
            lastDeltaSet = true
          }
        }
      }

      return {
        id: m.id,
        name: m.name,
        race: m.race,
        tier: m.tier,
        elo: totalDelta,
        wins,
        losses,
        streak: computeStreak(m.id, myMatches),
        change: lastDelta,
        rank: 0,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.elo - a.elo)
    .map((p, i) => ({ ...p, rank: i + 1 }))
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

export function RankingPublicClient({ members, allMatches }: RankingPublicClientProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filterMatchType, setFilterMatchType] = useState("__all__")
  const [filterRace, setFilterRace] = useState("__all__")
  const [filterTier, setFilterTier] = useState("__all__")

  const rankedPlayers = useMemo(
    () => computeRankedPlayers(members, allMatches, filterMatchType, filterRace, filterTier),
    [members, allMatches, filterMatchType, filterRace, filterTier],
  )

  const filteredPlayers = useMemo(
    () => rankedPlayers.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [rankedPlayers, searchQuery],
  )

  const isSeasonMode = filterMatchType !== "__all__"

  const top = rankedPlayers[0] ?? null
  const topGainer = rankedPlayers.length
    ? rankedPlayers.reduce((mx, p) => (p.change > mx.change ? p : mx), rankedPlayers[0])
    : null

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 헤더 */}
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

        {/* 요약 카드 */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <Crown className="h-6 w-6 text-yellow-400" />
              <span className="text-sm text-muted-foreground">현재 1위</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{top?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {top != null
                ? isSeasonMode
                  ? `시즌 ELO ${top.elo >= 0 ? "+" : ""}${top.elo}`
                  : `${top.elo} ELO`
                : ""}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-6 w-6 text-accent" />
              <span className="text-sm text-muted-foreground">
                최다 상승 {isSeasonMode ? `(${filterMatchType})` : "(최근 경기)"}
              </span>
            </div>
            <p className="text-2xl font-bold text-foreground">{topGainer?.name ?? "—"}</p>
            <p className="text-sm text-accent">
              {topGainer && topGainer.change > 0 ? `+${topGainer.change} pts` : "—"}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <Award className="h-6 w-6 text-violet-500" />
              <span className="text-sm text-muted-foreground">총 선수</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{rankedPlayers.length}</p>
            <p className="text-sm text-muted-foreground">
              {isSeasonMode ? "명 (해당 시즌 참가)" : "명 등록됨"}
            </p>
          </div>
        </section>

        {/* 검색 + 필터 */}
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
            <Select value={filterMatchType} onValueChange={setFilterMatchType}>
              <SelectTrigger className="w-52 bg-card border-border text-foreground">
                <SelectValue placeholder="전체 경기 유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체</SelectItem>
                {MATCH_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
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

            {(filterMatchType !== "__all__" || filterTier !== "__all__" || filterRace !== "__all__") && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setFilterMatchType("__all__")
                  setFilterTier("__all__")
                  setFilterRace("__all__")
                }}
              >
                필터 초기화
              </Button>
            )}
          </div>
          {isSeasonMode && (
            <p className="text-xs text-amber-400">
              시즌 모드: &quot;{filterMatchType}&quot; 경기 참가 선수만 표시됩니다.
            </p>
          )}
        </section>

        {/* 랭킹 테이블 (공개용: 순위·선수명·티어·종족·경기유형·연속승패만 표시) */}
        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold w-16 text-center">순위</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">선수명</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">티어</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">종족</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center whitespace-nowrap">경기 유형</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">연속</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => (
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
                      <span className={`font-semibold ${player.rank === 1 ? "text-yellow-400" : "text-foreground"}`}>
                        {player.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={`text-xs font-semibold px-1.5 py-0 ${tierColors[player.tier]}`}
                      >
                        {player.tier}티어
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={raceColors[player.race]}>
                        {raceNames[player.race]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {filterMatchType === "__all__" ? "전체" : filterMatchType}
                      </span>
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
                {isSeasonMode
                  ? `"${filterMatchType}" 경기 기록이 없습니다`
                  : "검색 결과가 없습니다"}
              </p>
              <p className="text-sm">필터 조건을 확인해 주세요</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
