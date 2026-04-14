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
import {
  Award,
  ArrowLeft,
  BarChart3,
  Crown,
  Percent,
  Search,
  Swords,
  TrendingUp,
  Trophy,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { MemberForRanking, MatchForRanking, Season, SeasonRankingEntry } from "@/lib/types/tufelo"
import {
  computeRankedPlayers,
  formatSeasonDateRange,
  raceColors,
  raceNames,
  tierColors,
} from "@/lib/ranking-utils"
import { RankIcon, ChangeDisplay, StreakDisplay } from "@/components/ranking-shared"

interface RankingPageClientProps {
  members: MemberForRanking[]
  allMatches: MatchForRanking[]
  seasons: Season[]
  currentSeason: Season | null
  pastSeasonRankings: Record<string, SeasonRankingEntry[]>
}

export function RankingPageClient({
  members,
  allMatches,
  seasons,
  currentSeason,
  pastSeasonRankings,
}: RankingPageClientProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filterSeasonId, setFilterSeasonId] = useState("__current__")
  const [filterRace, setFilterRace] = useState("__all__")
  const [filterTier, setFilterTier] = useState("1")

  const pastSeasons = useMemo(() => seasons.filter((s) => s.endDate !== null), [seasons])

  const rankedPlayers = useMemo(
    () =>
      computeRankedPlayers(
        members,
        allMatches,
        filterSeasonId,
        filterRace,
        filterTier,
        pastSeasonRankings,
        true,
      ),
    [members, allMatches, filterSeasonId, filterRace, filterTier, pastSeasonRankings],
  )

  /** 총 선수 카드: 시즌·종족·전적 조건은 동일, 티어 필터는 적용하지 않음 */
  const rankedPlayersAllTiers = useMemo(
    () =>
      computeRankedPlayers(
        members,
        allMatches,
        filterSeasonId,
        filterRace,
        "__all__",
        pastSeasonRankings,
        true,
      ),
    [members, allMatches, filterSeasonId, filterRace, pastSeasonRankings],
  )

  const filteredPlayers = useMemo(
    () => rankedPlayers.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [rankedPlayers, searchQuery],
  )

  const top = rankedPlayers[0] ?? null
  const topGainer = rankedPlayers.length
    ? rankedPlayers.reduce((mx, p) => (p.rankChange > mx.rankChange ? p : mx), rankedPlayers[0])
    : null

  const topWins = useMemo(() => {
    if (!rankedPlayers.length) return null
    return rankedPlayers.reduce((mx, p) => {
      if (p.wins > mx.wins) return p
      if (p.wins < mx.wins) return mx
      return p.elo > mx.elo ? p : mx
    }, rankedPlayers[0])
  }, [rankedPlayers])

  const topWinRate = useMemo(() => {
    const qualified = rankedPlayers.filter((p) => p.wins + p.losses >= 20)
    if (!qualified.length) return null
    return qualified.reduce((best, p) => {
      const bt = best.wins + best.losses
      const pt = p.wins + p.losses
      return p.wins * bt > best.wins * pt ? p : best
    }, qualified[0])
  }, [rankedPlayers])

  const topGames = useMemo(() => {
    if (!rankedPlayers.length) return null
    return rankedPlayers.reduce((mx, p) => {
      const gt = p.wins + p.losses
      const mt = mx.wins + mx.losses
      return gt > mt ? p : mx
    }, rankedPlayers[0])
  }, [rankedPlayers])

  const isPastSeason = filterSeasonId !== "__current__"
  const selectedSeason = isPastSeason
    ? pastSeasons.find((s) => s.id === filterSeasonId) ?? null
    : currentSeason

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

        {/* 요약 카드 */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <Crown className="h-6 w-6 text-orange-500" />
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
              <Award className="h-6 w-6 text-primary" />
              <span className="text-sm text-muted-foreground">총 선수</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{rankedPlayersAllTiers.length}</p>
            <p className="text-sm text-muted-foreground">명 (전 티어 합산)</p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <Swords className="h-6 w-6 text-amber-500" />
              <span className="text-sm text-muted-foreground">최다승</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{topWins?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {topWins != null ? `${topWins.wins}승 (${topWins.wins}W / ${topWins.losses}L)` : ""}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <Percent className="h-6 w-6 text-emerald-500" />
              <span className="text-sm text-muted-foreground">최고승률 (20판 이상)</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{topWinRate?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {topWinRate != null
                ? (() => {
                    const t = topWinRate.wins + topWinRate.losses
                    const pct = t > 0 ? ((topWinRate.wins / t) * 100).toFixed(1) : "0.0"
                    return `${pct}% · ${t}판`
                  })()
                : rankedPlayers.some((p) => p.wins + p.losses > 0)
                  ? "20판 이상인 선수 없음"
                  : ""}
            </p>
          </div>
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="h-6 w-6 text-sky-500" />
              <span className="text-sm text-muted-foreground">최다판수</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{topGames?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {topGames != null
                ? `${topGames.wins + topGames.losses}판 (${topGames.wins}W / ${topGames.losses}L)`
                : ""}
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
                <SelectValue placeholder="티어" />
              </SelectTrigger>
              <SelectContent>
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

            {(filterSeasonId !== "__current__" || filterTier !== "1" || filterRace !== "__all__") && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setFilterSeasonId("__current__")
                  setFilterTier("1")
                  setFilterRace("__all__")
                }}
              >
                필터 초기화
              </Button>
            )}
          </div>
          {isPastSeason && selectedSeason && (
            <p className="text-xs text-amber-400">
              과거 시즌 보기: {selectedSeason.name} ({formatSeasonDateRange(selectedSeason)}) — 시즌 종료 시점 최종 순위입니다.
            </p>
          )}
        </section>

        {/* 랭킹 테이블 */}
        <section className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold w-16 text-center">순위</TableHead>
                  <TableHead className="text-muted-foreground font-semibold">선수명</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">티어</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">종족</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-right">ELO</TableHead>
                  {!isPastSeason && (
                    <TableHead className="text-muted-foreground font-semibold text-center">변동(최근5경기)</TableHead>
                  )}
                  <TableHead className="text-muted-foreground font-semibold text-center">전적</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-center">승률</TableHead>
                  {!isPastSeason && (
                    <TableHead className="text-muted-foreground font-semibold text-center">연속</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => {
                  const total = player.wins + player.losses
                  const winRate = total > 0 ? ((player.wins / total) * 100).toFixed(1) : "0.0"
                  return (
                    <TableRow
                      key={player.id}
                      className={`border-border hover:bg-secondary/50 transition-colors ${player.rank <= 3 ? "bg-secondary/30" : ""}`}
                    >
                      <TableCell className="text-center">
                        <div className="flex justify-center"><RankIcon rank={player.rank} /></div>
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold ${player.rank === 1 ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
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
                      <TableCell className="text-right">
                        <span className="font-mono font-bold text-primary text-lg">{player.elo}</span>
                      </TableCell>
                      {!isPastSeason && (
                        <TableCell className="text-center">
                          <ChangeDisplay change={player.change} />
                        </TableCell>
                      )}
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
                      {!isPastSeason && (
                        <TableCell className="text-center">
                          <StreakDisplay streak={player.streak} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
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
