"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  BarChart3,
  Database,
  Filter,
  LineChart as LineChartIcon,
  Percent,
  RotateCcw,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { resolveMemberIdsByPlayerQuery } from "@/lib/resolve-member-ids-by-player-query"
import type { Race, Season } from "@/lib/types/tufelo"
import type { DataCenterMatch, DataCenterMember } from "@/lib/data/data-center"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import {
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfISOWeek,
} from "date-fns"

/** 선수 맵별 승률 막대 색 (맵당 순환) */
const PLAYER_MAP_BAR_COLORS = [
  "hsl(217 91% 55%)",
  "hsl(160 72% 42%)",
  "hsl(42 96% 48%)",
  "hsl(283 72% 52%)",
  "hsl(0 84% 56%)",
  "hsl(199 89% 48%)",
  "hsl(32 95% 52%)",
  "hsl(328 76% 58%)",
  "hsl(142 71% 45%)",
  "hsl(262 83% 58%)",
  "hsl(48 96% 53%)",
  "hsl(350 78% 56%)",
]

/** 주차별 Elo 차트 — SVG 내부에서 CSS 변수가 안 먹을 때 검은 점으로 보이는 문제 방지용 고정 색 */
const ELO_WEEK_LINE_COLOR = "#38bdf8"
const ELO_WEEK_DOT_FILL = "#fbbf24"
const ELO_WEEK_DOT_RING = "#0f172a"

/** 이중축 차트 승률 꺾은선 — 테/프/저 막대색과 겹치지 않는 자주·보라 계열 */
const MAP_WINRATE_LINE_COLOR = "#a855f7"

/** 시즌 테이블과 별개로, 프로리그 시즌1·2 경기만 모아 보기 */
const SEASON_OPTION_PROLEAGUE_S1 = "__proleague_s1__" as const
const SEASON_OPTION_PROLEAGUE_S2 = "__proleague_s2__" as const
/** DB·API와 동일 — 실제 저장값은 `TFPL_S1` / `TFPL_S2` (app/api/matches). 비교는 대소문자 무시. */
const PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION: Record<string, string> = {
  [SEASON_OPTION_PROLEAGUE_S1]: "TFPL_S1",
  [SEASON_OPTION_PROLEAGUE_S2]: "TFPL_S2",
}

function matchPassesSeasonFilter(seasonId: string, match: DataCenterMatch): boolean {
  if (seasonId === "__all__") return true
  const mt = PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[seasonId]
  if (mt !== undefined) {
    return match.matchType.trim().toUpperCase() === mt.toUpperCase()
  }
  return match.seasonId === seasonId
}

const raceOrder: Race[] = ["T", "P", "Z"]
const raceNames: Record<Race, string> = { T: "테란", P: "프로토스", Z: "저그" }
const raceColors: Record<Race, string> = {
  T: "hsl(217 91% 60%)",
  P: "hsl(42 96% 52%)",
  Z: "hsl(0 84% 60%)",
}

interface DataCenterPageClientProps {
  members: DataCenterMember[]
  matches: DataCenterMatch[]
  seasons: Season[]
}

interface PerspectiveRow {
  race: Race
  isWin: boolean
  mapName: string
  seasonKey: string
}

function parseMinGames(search: string | null): number {
  const parsed = Number(search ?? "0")
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

/** 선수1(anchorIds)이 출전한 포지션의 member id — 선수1 필터 전용 집계에 사용 */
function anchorPlayerIdFromMatch(match: DataCenterMatch, anchorIds: Set<string>): string | null {
  if (anchorIds.has(match.player1Id)) return match.player1Id
  if (anchorIds.has(match.player2Id)) return match.player2Id
  return null
}

/** 경기 일자 기준 ISO 주차 (정렬용 키 + 표시 라벨) */
function weekKeyFromPlayedDate(playedDate: string): { sortKey: string; label: string } | null {
  const d = parseISO(playedDate)
  if (Number.isNaN(d.getTime())) return null
  const y = getISOWeekYear(d)
  const w = getISOWeek(d)
  const sortKey = `${y}-W${String(w).padStart(2, "0")}`
  const start = startOfISOWeek(d)
  const end = endOfISOWeek(d)
  const label = `${y}.${format(start, "M.d")}~${format(end, "M.d")}`
  return { sortKey, label }
}

export function DataCenterPageClient({ members, matches, seasons }: DataCenterPageClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentSeason = useMemo(() => seasons.find((s) => s.endDate === null) ?? null, [seasons])
  const [seasonId, setSeasonId] = useState(searchParams.get("season") ?? currentSeason?.id ?? "__all__")
  const [mapName, setMapName] = useState(searchParams.get("map") ?? "__all__")
  const [matchType, setMatchType] = useState(searchParams.get("matchType") ?? "__all__")
  const [race, setRace] = useState(searchParams.get("race") ?? "__all__")
  const [playerFilterEnabled, setPlayerFilterEnabled] = useState(searchParams.get("players") === "on")
  const [playerQuery, setPlayerQuery] = useState(searchParams.get("player") ?? "")
  const [player2Query, setPlayer2Query] = useState(searchParams.get("player2") ?? "__all__")
  const [minGames, setMinGames] = useState(parseMinGames(searchParams.get("minGames")))

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const activePlayerQuery = playerFilterEnabled ? playerQuery : ""
  const normalizedPlayer2Query = player2Query === "__all__" ? "" : player2Query
  const activePlayer2Query = playerFilterEnabled ? normalizedPlayer2Query : ""
  const matchedPlayerIds = useMemo(
    () => new Set(resolveMemberIdsByPlayerQuery(members, activePlayerQuery)),
    [members, activePlayerQuery],
  )
  const matchedPlayer2Ids = useMemo(
    () => new Set(resolveMemberIdsByPlayerQuery(members, activePlayer2Query)),
    [members, activePlayer2Query],
  )

  /** 선수 필터 ON + 선수1 검색에 해당하는 ID가 있을 때만 선수1 기준 차트 */
  const usePlayer1Charts =
    playerFilterEnabled && activePlayerQuery.trim().length > 0 && matchedPlayerIds.size > 0

  const seasonOptions = useMemo(() => {
    const base = [{ id: "__all__", label: "전체 시즌" }]
    const proLeague = [
      { id: SEASON_OPTION_PROLEAGUE_S1, label: "시즌1 (TFPL_S1)" },
      { id: SEASON_OPTION_PROLEAGUE_S2, label: "시즌2 (TFPL_S2)" },
    ]
    const rows = seasons.map((s) => ({
      id: s.id,
      label: s.endDate === null ? `${s.name} (현재)` : s.name,
    }))
    return [...base, ...proLeague, ...rows]
  }, [seasons])

  const seasonFilteredMatches = useMemo(() => {
    return matches.filter((m) => matchPassesSeasonFilter(seasonId, m))
  }, [matches, seasonId])

  /** 시즌 필터로 걸린 경기에 출전한 서로 다른 선수 수 */
  const seasonPlayerCount = useMemo(() => {
    const ids = new Set<string>()
    for (const m of seasonFilteredMatches) {
      ids.add(m.player1Id)
      ids.add(m.player2Id)
    }
    return ids.size
  }, [seasonFilteredMatches])

  const selectedSeason = useMemo(() => {
    if (seasonId === "__all__") return null
    if (PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[seasonId] !== undefined) return null
    return seasons.find((s) => s.id === seasonId) ?? null
  }, [seasonId, seasons])

  function resetAllFilters() {
    setSeasonId("__all__")
    setMapName("__all__")
    setMatchType("__all__")
    setRace("__all__")
    setPlayerFilterEnabled(false)
    setPlayerQuery("")
    setPlayer2Query("__all__")
    setMinGames(0)
  }

  const mapOptions = useMemo(() => {
    const rows = Array.from(new Set(seasonFilteredMatches.map((m) => m.mapName)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ko"))
    return ["__all__", ...rows]
  }, [seasonFilteredMatches])

  const matchTypeOptions = useMemo(() => {
    const rows = Array.from(new Set(seasonFilteredMatches.map((m) => m.matchType)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ko"))
    return ["__all__", ...rows]
  }, [seasonFilteredMatches])

  /** 시즌 필터를 적용한 상태에서 선수1과 실제로 경기한 상대 목록(경기 수 내림차순) */
  const player2Options = useMemo(() => {
    if (!playerFilterEnabled || matchedPlayerIds.size === 0) return [] as { name: string; games: number }[]
    const counter = new Map<string, number>()
    for (const match of seasonFilteredMatches) {
      const p1IsAnchor = matchedPlayerIds.has(match.player1Id)
      const p2IsAnchor = matchedPlayerIds.has(match.player2Id)
      if (!p1IsAnchor && !p2IsAnchor) continue
      const opponentId = p1IsAnchor ? match.player2Id : match.player1Id
      const opponent = memberById.get(opponentId)
      if (!opponent) continue
      counter.set(opponent.name, (counter.get(opponent.name) ?? 0) + 1)
    }
    return [...counter.entries()]
      .map(([name, games]) => ({ name, games }))
      .sort((a, b) => (b.games - a.games) || a.name.localeCompare(b.name, "ko"))
  }, [playerFilterEnabled, matchedPlayerIds, seasonFilteredMatches, memberById])

  useEffect(() => {
    const next = new URLSearchParams()
    if (seasonId !== "__all__") next.set("season", seasonId)
    if (mapName !== "__all__") next.set("map", mapName)
    if (matchType !== "__all__") next.set("matchType", matchType)
    if (race !== "__all__") next.set("race", race)
    if (playerFilterEnabled) next.set("players", "on")
    if (playerFilterEnabled && playerQuery.trim()) next.set("player", playerQuery.trim())
    if (playerFilterEnabled && normalizedPlayer2Query.trim()) next.set("player2", normalizedPlayer2Query.trim())
    if (minGames !== 0) next.set("minGames", String(minGames))
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [seasonId, mapName, matchType, race, playerFilterEnabled, playerQuery, normalizedPlayer2Query, minGames, pathname, router])

  useEffect(() => {
    if (mapName !== "__all__" && !mapOptions.includes(mapName)) {
      setMapName("__all__")
    }
  }, [mapName, mapOptions])
  useEffect(() => {
    if (matchType !== "__all__" && !matchTypeOptions.includes(matchType)) {
      setMatchType("__all__")
    }
  }, [matchType, matchTypeOptions])
  useEffect(() => {
    if (!playerFilterEnabled) return
    if (player2Query === "__all__") return
    const exists = player2Options.some((opt) => opt.name === player2Query)
    if (!exists) setPlayer2Query("__all__")
  }, [playerFilterEnabled, player2Query, player2Options])

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (!matchPassesSeasonFilter(seasonId, match)) return false
      if (mapName !== "__all__" && match.mapName !== mapName) return false
      if (matchType !== "__all__" && match.matchType !== matchType) return false
      const hasPlayer1Filter = activePlayerQuery.trim().length > 0
      const hasPlayer2Filter = activePlayer2Query.trim().length > 0
      if (hasPlayer1Filter && matchedPlayerIds.size === 0) return false
      if (hasPlayer2Filter && matchedPlayer2Ids.size === 0) return false
      if (hasPlayer1Filter && hasPlayer2Filter) {
        const pairMatched =
          (matchedPlayerIds.has(match.player1Id) && matchedPlayer2Ids.has(match.player2Id)) ||
          (matchedPlayerIds.has(match.player2Id) && matchedPlayer2Ids.has(match.player1Id))
        if (!pairMatched) return false
      } else if (hasPlayer1Filter) {
        if (!matchedPlayerIds.has(match.player1Id) && !matchedPlayerIds.has(match.player2Id)) return false
      } else if (hasPlayer2Filter) {
        if (!matchedPlayer2Ids.has(match.player1Id) && !matchedPlayer2Ids.has(match.player2Id)) return false
      }
      if (race !== "__all__") {
        const p1Race = memberById.get(match.player1Id)?.race
        const p2Race = memberById.get(match.player2Id)?.race
        if (p1Race !== race && p2Race !== race) return false
      }
      return true
    })
  }, [
    matches,
    seasonId,
    mapName,
    matchType,
    race,
    activePlayerQuery,
    activePlayer2Query,
    matchedPlayerIds,
    matchedPlayer2Ids,
    memberById,
  ])

  const perspectiveRows = useMemo(() => {
    const rows: PerspectiveRow[] = []
    for (const match of filteredMatches) {
      const p1 = memberById.get(match.player1Id)
      const p2 = memberById.get(match.player2Id)
      if (!p1 || !p2) continue

      /** 시즌 테이블 UUID 없이도 메타 차트에 포함 — TFPL 등은 match_type만 있고 season_id 가 null 인 경우가 많음 */
      const seasonKey = match.seasonId ?? "__no_db_season__"
      const hasPlayer1Filter = activePlayerQuery.trim().length > 0 && matchedPlayerIds.size > 0
      const hasPlayer2Filter = activePlayer2Query.trim().length > 0 && matchedPlayer2Ids.size > 0
      const useAnchorPlayerIds = hasPlayer1Filter ? matchedPlayerIds : hasPlayer2Filter ? matchedPlayer2Ids : null

      if (!useAnchorPlayerIds || useAnchorPlayerIds.has(match.player1Id)) {
        rows.push({
          race: p1.race,
          isWin: match.winnerId === match.player1Id,
          mapName: match.mapName,
          seasonKey: seasonKey,
        })
      }
      if (!useAnchorPlayerIds || useAnchorPlayerIds.has(match.player2Id)) {
        rows.push({
          race: p2.race,
          isWin: match.winnerId === match.player2Id,
          mapName: match.mapName,
          seasonKey: seasonKey,
        })
      }
    }
    return rows
  }, [filteredMatches, memberById, activePlayerQuery, activePlayer2Query, matchedPlayerIds, matchedPlayer2Ids])

  /** 메타: 전체 풀 — 선수 필터 없을 때 */
  const metaRaceWinRates = useMemo(() => {
    const grouped = new Map<Race, { race: Race; games: number; wins: number; winRate: number }>()
    for (const row of perspectiveRows) {
      const prev = grouped.get(row.race) ?? { race: row.race, games: 0, wins: 0, winRate: 0 }
      prev.games += 1
      if (row.isWin) prev.wins += 1
      grouped.set(row.race, prev)
    }
    return raceOrder
      .map((r) => grouped.get(r) ?? { race: r, games: 0, wins: 0, winRate: 0 })
      .map((item) => ({ ...item, winRate: item.games > 0 ? Number(((item.wins / item.games) * 100).toFixed(1)) : 0 }))
      .filter((item) => item.games >= minGames)
  }, [perspectiveRows, minGames])

  /** 선수1 기준: 상대 종족별 승률 (선수2 입력 시 filteredMatches 가 대전만 남김) */
  const playerVsOpponentRaceWinRates = useMemo(() => {
    const grouped = new Map<Race, { race: Race; games: number; wins: number; winRate: number }>()
    for (const match of filteredMatches) {
      const anchorId = anchorPlayerIdFromMatch(match, matchedPlayerIds)
      if (!anchorId) continue
      const opp = anchorId === match.player1Id ? memberById.get(match.player2Id) : memberById.get(match.player1Id)
      if (!opp) continue
      const won = match.winnerId === anchorId
      const prev = grouped.get(opp.race) ?? { race: opp.race, games: 0, wins: 0, winRate: 0 }
      prev.games += 1
      if (won) prev.wins += 1
      grouped.set(opp.race, prev)
    }
    return raceOrder
      .map((r) => grouped.get(r) ?? { race: r, games: 0, wins: 0, winRate: 0 })
      .map((item) => ({ ...item, winRate: item.games > 0 ? Number(((item.wins / item.games) * 100).toFixed(1)) : 0 }))
      .filter((item) => item.games >= minGames)
  }, [filteredMatches, matchedPlayerIds, memberById, minGames])

  const raceWinRates = usePlayer1Charts ? playerVsOpponentRaceWinRates : metaRaceWinRates

  const metaMapRaceWinRates = useMemo(() => {
    const mapRace = new Map<string, Record<Race, { games: number; wins: number }>>()
    for (const row of perspectiveRows) {
      const mapEntry = mapRace.get(row.mapName) ?? {
        T: { games: 0, wins: 0 },
        P: { games: 0, wins: 0 },
        Z: { games: 0, wins: 0 },
      }
      mapEntry[row.race].games += 1
      if (row.isWin) mapEntry[row.race].wins += 1
      mapRace.set(row.mapName, mapEntry)
    }

    return Array.from(mapRace.entries())
      .map(([map, values]) => {
        const tGames = values.T.games
        const pGames = values.P.games
        const zGames = values.Z.games
        const total = tGames + pGames + zGames
        return {
          map,
          T: tGames >= minGames ? Number(((values.T.wins / tGames) * 100).toFixed(1)) : null,
          P: pGames >= minGames ? Number(((values.P.wins / pGames) * 100).toFixed(1)) : null,
          Z: zGames >= minGames ? Number(((values.Z.wins / zGames) * 100).toFixed(1)) : null,
          tGames,
          pGames,
          zGames,
          total,
        }
      })
      .filter((item) => item.T !== null || item.P !== null || item.Z !== null)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
  }, [perspectiveRows, minGames])

  /** 선수1 기준 맵별 승률 (막대 1열 — 선수2 있으면 이미 대전만 포함) */
  const playerMapWinRates = useMemo(() => {
    const byMap = new Map<string, { map: string; games: number; wins: number; winRate: number; fill: string }>()
    for (const match of filteredMatches) {
      const anchorId = anchorPlayerIdFromMatch(match, matchedPlayerIds)
      if (!anchorId) continue
      const won = match.winnerId === anchorId
      const prev = byMap.get(match.mapName) ?? { map: match.mapName, games: 0, wins: 0, winRate: 0, fill: "" }
      prev.games += 1
      if (won) prev.wins += 1
      byMap.set(match.mapName, prev)
    }
    const rows = Array.from(byMap.values())
      .filter((row) => row.games >= minGames)
      .map((row) => ({
        ...row,
        winRate: Number(((row.wins / row.games) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 12)
    return rows.map((row, i) => ({
      ...row,
      fill: PLAYER_MAP_BAR_COLORS[i % PLAYER_MAP_BAR_COLORS.length],
    }))
  }, [filteredMatches, matchedPlayerIds, minGames])

  /** 메타: 주차별 클랜 풀 종족 승률 추이 */
  const metaWeekRaceTrend = useMemo(() => {
    const grouped = new Map<string, { sortKey: string; label: string; stats: Record<Race, { games: number; wins: number }> }>()

    for (const match of filteredMatches) {
      const wk = weekKeyFromPlayedDate(match.playedDate)
      if (!wk) continue

      const p1 = memberById.get(match.player1Id)
      const p2 = memberById.get(match.player2Id)
      if (!p1 || !p2) continue

      const hasPlayer1Filter = activePlayerQuery.trim().length > 0 && matchedPlayerIds.size > 0
      const hasPlayer2Filter = activePlayer2Query.trim().length > 0 && matchedPlayer2Ids.size > 0
      const useAnchorPlayerIds = hasPlayer1Filter ? matchedPlayerIds : hasPlayer2Filter ? matchedPlayer2Ids : null

      let bucket = grouped.get(wk.sortKey)
      if (!bucket) {
        bucket = {
          sortKey: wk.sortKey,
          label: wk.label,
          stats: {
            T: { games: 0, wins: 0 },
            P: { games: 0, wins: 0 },
            Z: { games: 0, wins: 0 },
          },
        }
        grouped.set(wk.sortKey, bucket)
      }

      if (!useAnchorPlayerIds || useAnchorPlayerIds.has(match.player1Id)) {
        bucket.stats[p1.race].games += 1
        if (match.winnerId === match.player1Id) bucket.stats[p1.race].wins += 1
      }
      if (!useAnchorPlayerIds || useAnchorPlayerIds.has(match.player2Id)) {
        bucket.stats[p2.race].games += 1
        if (match.winnerId === match.player2Id) bucket.stats[p2.race].wins += 1
      }
    }

    const sorted = [...grouped.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey))

    return sorted.map(({ label, stats }) => ({
      weekLabel: label,
      T: stats.T.games >= minGames ? Number(((stats.T.wins / stats.T.games) * 100).toFixed(1)) : null,
      P: stats.P.games >= minGames ? Number(((stats.P.wins / stats.P.games) * 100).toFixed(1)) : null,
      Z: stats.Z.games >= minGames ? Number(((stats.Z.wins / stats.Z.games) * 100).toFixed(1)) : null,
    }))
  }, [
    filteredMatches,
    memberById,
    activePlayerQuery,
    activePlayer2Query,
    matchedPlayerIds,
    matchedPlayer2Ids,
    minGames,
  ])

  /** 선수1 기준: 주차별 경기 종료 직후 Elo 점수 (해당 주 마지막 경기 기준) — 최근 4주만 */
  const playerWeekEloTrend = useMemo(() => {
    type Row = { sortKey: string; label: string; playedDate: string; id: string; eloScore: number }
    const rows: Row[] = []

    for (const match of filteredMatches) {
      if (selectedSeason) {
        if (match.playedDate < selectedSeason.startDate) continue
        if (selectedSeason.endDate !== null && match.playedDate > selectedSeason.endDate) continue
      }
      const anchorId = anchorPlayerIdFromMatch(match, matchedPlayerIds)
      if (!anchorId) continue
      const before = anchorId === match.player1Id ? match.player1EloBefore : match.player2EloBefore
      const delta = anchorId === match.player1Id ? match.player1EloDelta : match.player2EloDelta
      if (before === null || delta === null) continue
      const b = Number(before)
      const d = Number(delta)
      if (!Number.isFinite(b) || !Number.isFinite(d)) continue
      const eloScore = b + d
      const wk = weekKeyFromPlayedDate(match.playedDate)
      if (!wk) continue
      rows.push({
        sortKey: wk.sortKey,
        label: wk.label,
        playedDate: match.playedDate,
        id: match.id,
        eloScore,
      })
    }

    rows.sort((a, b) => a.playedDate.localeCompare(b.playedDate) || a.id.localeCompare(b.id))

    const lastInWeek = new Map<string, { label: string; eloScore: number }>()
    for (const row of rows) {
      lastInWeek.set(row.sortKey, { label: row.label, eloScore: row.eloScore })
    }

    const sortedKeys = [...lastInWeek.keys()].sort((a, b) => a.localeCompare(b))
    const lastFour = sortedKeys.slice(-4)
    return lastFour.map((key) => {
      const v = lastInWeek.get(key)!
      return {
        weekLabel: v.label,
        eloScore: Number(v.eloScore.toFixed(1)),
      }
    })
  }, [filteredMatches, matchedPlayerIds, selectedSeason])

  const chartConfig = {
    T: { label: "테란", color: raceColors.T },
    P: { label: "프로토스", color: raceColors.P },
    Z: { label: "저그", color: raceColors.Z },
  } satisfies ChartConfig

  const eloWeekChartConfig = {
    eloScore: { label: "Elo 점수", color: ELO_WEEK_LINE_COLOR },
  } satisfies ChartConfig

  const totalMatchCount = filteredMatches.length
  const totalAllMatches = matches.length

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
                <Database className="h-7 w-7 text-primary" />
                데이터센터
              </h1>
              <p className="text-sm text-muted-foreground">필터 상태를 URL로 공유할 수 있습니다.
                 <span className="font-medium text-foreground">테스트중이므로 피드백 환영합니다. 차트는 계속 바뀔예정입니다.</span></p>
            </div>
          </div>
          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            현재 조건 기준{" "}
            <span className="font-mono font-medium text-foreground">
              {totalMatchCount.toLocaleString()}/{totalAllMatches.toLocaleString()}
            </span>{" "}
            경기 반영
          </div>
        </header>

        <Card className="mb-6">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-4 w-4" />
                필터
              </CardTitle>
              <CardDescription>페이지 진입 시 한 번 로드한 데이터로 차트를 갱신합니다.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={resetAllFilters}>
              <RotateCcw className="h-4 w-4" />
              필터 전체 초기화
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="player-filter-toggle" className="cursor-pointer">
                  선수 필터 사용
                </Label>
                <Switch
                  id="player-filter-toggle"
                  checked={playerFilterEnabled}
                  onCheckedChange={setPlayerFilterEnabled}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                기본값은 전체 차트입니다. 켜면 선수 기준 차트로 전환됩니다.
              </p>
            </div>

            {playerFilterEnabled && (
              <>
                <div className="space-y-2">
                  <Label>선수1</Label>
                  <Input
                    placeholder="선수 이름 검색..."
                    value={playerQuery}
                    onChange={(e) => setPlayerQuery(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>선수2(선택)</Label>
                  <Select
                    value={player2Query}
                    onValueChange={setPlayer2Query}
                    disabled={!usePlayer1Charts || player2Options.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !usePlayer1Charts
                            ? "먼저 선수1을 정확히 입력하세요"
                            : player2Options.length === 0
                              ? "해당 시즌 기준 상대 전적 없음"
                              : "상대 선수 선택"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">전체 상대</SelectItem>
                      {player2Options.map((opt) => (
                        <SelectItem key={opt.name} value={opt.name}>
                          {opt.name} ({opt.games}경기)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>시즌</Label>
              <Select value={seasonId} onValueChange={setSeasonId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seasonOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>종족</Label>
              <Select value={race} onValueChange={setRace}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 종족</SelectItem>
                  <SelectItem value="T">테란</SelectItem>
                  <SelectItem value="P">프로토스</SelectItem>
                  <SelectItem value="Z">저그</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>맵</Label>
              <Select value={mapName} onValueChange={setMapName}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mapOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "__all__" ? "전체 맵" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>경기 유형</Label>
              <Select value={matchType} onValueChange={setMatchType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {matchTypeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "__all__" ? "전체 경기 유형" : option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>최소 경기 수</Label>
                <span className="text-xs text-muted-foreground">{minGames}경기 이상</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[minGames]}
                onValueChange={(v) => setMinGames(v[0] ?? 0)}
              />
              <p className="text-xs text-muted-foreground">슬라이더 최소값은 0입니다.</p>
            </div>
          </CardContent>
        </Card>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Percent className="h-4 w-4" />
                {usePlayer1Charts ? `${activePlayerQuery.trim()} · 상대 종족별 승률 · 경기 수` : "종족별 승률 · 경기 수"}
              </CardTitle>
              <CardDescription>
                {usePlayer1Charts ? (
                  <>
                    선수1({activePlayerQuery.trim()}) 기준 상대 종족별 통계입니다. 막대는{" "}
                    <span className="font-medium text-foreground">경기 수</span>, 보라색 꺾은선은{" "}
                    <span className="font-medium text-foreground">승률(%)</span>입니다. 막대 클릭 시 종족 필터가 상대 종족 기준으로 맞춰집니다.
                  </>
                ) : (
                  <>
                    클랜 전체 종족별 통계입니다. 막대는 <span className="font-medium text-foreground">경기 수</span>, 보라색 꺾은선은{" "}
                    <span className="font-medium text-foreground">승률(%)</span>입니다. 막대를 클릭하면 페이지 종족 필터가 연동됩니다.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {raceWinRates.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {playerFilterEnabled && !usePlayer1Charts
                    ? "선수1 이름을 검색하면 선수 기준 차트로 바뀝니다."
                    : "최소 경기 수 조건을 만족하는 종족 데이터가 없습니다."}
                </div>
              ) : (
                <ChartContainer
                  className="h-[320px] w-full"
                  config={{
                    games: { label: "경기 수", color: "hsl(217 91% 55%)" },
                    winRate: { label: "승률", color: MAP_WINRATE_LINE_COLOR },
                  }}
                >
                  <ComposedChart data={raceWinRates} margin={{ left: 4, right: 18, top: 20, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/30" />
                    <XAxis dataKey="race" tickFormatter={(v) => raceNames[v as Race]} tick={{ fontSize: 11 }} />
                    <YAxis
                      yAxisId="games"
                      domain={[0, "auto"]}
                      width={44}
                      allowDecimals={false}
                      tickFormatter={(v) => `${v}`}
                      label={{ value: "경기 수", angle: -90, position: "insideLeft", offset: 6, style: { fontSize: 10 } }}
                    />
                    <YAxis
                      yAxisId="rate"
                      orientation="right"
                      domain={[0, 100]}
                      width={44}
                      tickFormatter={(v) => `${v}%`}
                      label={{ value: "승률", angle: 90, position: "insideRight", offset: 10, style: { fontSize: 10 } }}
                    />
                    <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted) / 0.25)" }} />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      wrapperStyle={{ fontSize: 11 }}
                      iconSize={10}
                      formatter={(value) =>
                        value === "games" ? "경기 수 (막대)" : value === "winRate" ? "승률 (꺾은선)" : String(value)
                      }
                    />
                    <Bar
                      yAxisId="games"
                      dataKey="games"
                      name="games"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={72}
                      isAnimationActive={false}
                      className="cursor-pointer outline-none [&_.recharts-rectangle]:cursor-pointer"
                      onClick={(_data, index) => {
                        const row = typeof index === "number" ? raceWinRates[index] : undefined
                        if (row?.race === "T" || row?.race === "P" || row?.race === "Z") setRace(row.race)
                      }}
                    >
                      {raceWinRates.map((entry) => (
                        <Cell key={entry.race} fill={raceColors[entry.race]} />
                      ))}
                      <LabelList
                        dataKey="games"
                        position="top"
                        offset={6}
                        formatter={(v: number) => `${v}판`}
                        className="fill-muted-foreground text-[10px]"
                      />
                    </Bar>
                    <Line
                      yAxisId="rate"
                      type="monotone"
                      dataKey="winRate"
                      name="winRate"
                      stroke={MAP_WINRATE_LINE_COLOR}
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: MAP_WINRATE_LINE_COLOR, stroke: "#0f172a", strokeWidth: 2 }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-4 w-4" />
                {usePlayer1Charts ? `${activePlayerQuery.trim()} · 맵별 승률 · 경기 수` : "맵별 종족 승률"}
              </CardTitle>
              <CardDescription>
                {usePlayer1Charts ? (
                  <>
                    선수1 기준 맵별 통계입니다. 막대는{" "}
                    <span className="font-medium text-foreground">경기 수</span>, 보라색 꺾은선은{" "}
                    <span className="font-medium text-foreground">승률(%)</span>입니다. 맵당 {minGames}판 이상일 때만 표시합니다.
                    {activePlayer2Query.trim()
                      ? ` 선수2가 지정된 경우 같은 조건의 상대전만 포함됩니다.`
                      : null}
                  </>
                ) : (
                  <>맵마다 종족별 경기 수가 {minGames}판 이상일 때만 해당 종족 승률 막대를 표시합니다.</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usePlayer1Charts ? (
                playerMapWinRates.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    최소 경기 수 조건을 만족하는 맵 데이터가 없습니다.
                  </div>
                ) : (
                  <ChartContainer
                    className="h-[320px] w-full pt-2"
                    config={{
                      games: { label: "경기 수", color: "hsl(217 91% 55%)" },
                      winRate: { label: "승률", color: MAP_WINRATE_LINE_COLOR },
                    }}
                  >
                    <ComposedChart data={playerMapWinRates} margin={{ left: 4, right: 18, top: 20, bottom: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/30" />
                      <XAxis dataKey="map" interval={0} angle={-20} height={48} textAnchor="end" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="games"
                        domain={[0, "auto"]}
                        width={44}
                        allowDecimals={false}
                        tickFormatter={(v) => `${v}`}
                        label={{ value: "경기 수", angle: -90, position: "insideLeft", offset: 6, style: { fontSize: 10 } }}
                      />
                      <YAxis
                        yAxisId="rate"
                        orientation="right"
                        domain={[0, 100]}
                        width={44}
                        tickFormatter={(v) => `${v}%`}
                        label={{ value: "승률", angle: 90, position: "insideRight", offset: 10, style: { fontSize: 10 } }}
                      />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend
                        verticalAlign="top"
                        height={28}
                        wrapperStyle={{ fontSize: 11 }}
                        iconSize={10}
                        formatter={(value) =>
                          value === "games" ? "경기 수 (막대)" : value === "winRate" ? "승률 (꺾은선)" : String(value)
                        }
                      />
                      <Bar
                        yAxisId="games"
                        dataKey="games"
                        name="games"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={52}
                        isAnimationActive={false}
                      >
                        {playerMapWinRates.map((row) => (
                          <Cell key={row.map} fill={row.fill} />
                        ))}
                        <LabelList
                          dataKey="games"
                          position="top"
                          offset={6}
                          formatter={(v: number) => `${v}판`}
                          className="fill-muted-foreground text-[10px]"
                        />
                      </Bar>
                      <Line
                        yAxisId="rate"
                        type="monotone"
                        dataKey="winRate"
                        name="winRate"
                        stroke={MAP_WINRATE_LINE_COLOR}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: MAP_WINRATE_LINE_COLOR, stroke: "#0f172a", strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ChartContainer>
                )
              ) : metaMapRaceWinRates.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  최소 경기 수 조건을 만족하는 맵 데이터가 없습니다.
                </div>
              ) : (
                <ChartContainer className="h-[300px] w-full" config={chartConfig}>
                  <BarChart data={metaMapRaceWinRates} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/30" />
                    <XAxis dataKey="map" interval={0} angle={-20} height={48} textAnchor="end" />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={42} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name, item) => {
                            const p = item.payload as { tGames: number; pGames: number; zGames: number }
                            const n = name === "T" ? p.tGames : name === "P" ? p.pGames : p.zGames
                            return (
                              <div className="flex w-full items-center justify-between gap-4">
                                <span>{raceNames[name as Race]}</span>
                                <span className="font-mono">
                                  {value ?? "-"}% <span className="text-muted-foreground">(n={n})</span>
                                </span>
                              </div>
                            )
                          }}
                        />
                      }
                    />
                    <Bar dataKey="T" fill={raceColors.T} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="P" fill={raceColors.P} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Z" fill={raceColors.Z} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LineChartIcon className="h-4 w-4" />
                {usePlayer1Charts ? `${activePlayerQuery.trim()} · 주차별 Elo 점수` : "주차별 종족 승률 추이"}
              </CardTitle>
              <CardDescription>
                {usePlayer1Charts ? (
                  <>
                    각 주의 <span className="font-medium text-foreground">마지막 경기 직후 Elo</span>(경기 전 점수 + 변동)입니다. 시즌을
                    고르면 그 시즌 시작일 이후만 쓰고, <span className="font-medium text-foreground">가장 최근 4개 ISO 주차</span>만
                    표시합니다. 경기에 Elo 전·후 기록이 없으면 제외됩니다.
                    {seasonId === "__all__" && " (전체 시즌 선택 시 시작일 제한 없이 최근 4주만 표시합니다.)"}
                  </>
                ) : (
                  <>
                    경기 일자 기준 ISO 주별 추이입니다. 해당 주에서 종족별 경기 수가 {minGames}판 이상일 때만 해당 종족 선을
                    표시합니다.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(usePlayer1Charts ? playerWeekEloTrend.length === 0 : metaWeekRaceTrend.length === 0) ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {usePlayer1Charts
                    ? "이 조건에서 Elo 점수가 기록된 주차 데이터가 없습니다."
                    : "주차별 추이를 그릴 수 있는 데이터가 없습니다."}
                </div>
              ) : usePlayer1Charts ? (
                <ChartContainer className="h-[320px] w-full" config={eloWeekChartConfig}>
                  <LineChart data={playerWeekEloTrend} margin={{ left: 8, right: 10, top: 16, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/30" />
                    <XAxis dataKey="weekLabel" interval={0} angle={-25} height={52} textAnchor="end" />
                    <YAxis
                      domain={["dataMin - 15", "dataMax + 15"]}
                      width={52}
                      tickFormatter={(v) => String(v)}
                    />
                    <Tooltip content={<ChartTooltipContent />} formatter={(value) => [`${value}`, "Elo 점수"]} />
                    <Line
                      type="linear"
                      dataKey="eloScore"
                      stroke={ELO_WEEK_LINE_COLOR}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={{
                        r: 5,
                        fill: ELO_WEEK_DOT_FILL,
                        stroke: ELO_WEEK_DOT_RING,
                        strokeWidth: 2,
                      }}
                      activeDot={{
                        r: 6,
                        fill: ELO_WEEK_DOT_FILL,
                        stroke: ELO_WEEK_LINE_COLOR,
                        strokeWidth: 2,
                      }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <ChartContainer className="h-[320px] w-full" config={chartConfig}>
                  <LineChart data={metaWeekRaceTrend} margin={{ left: 8, right: 10, top: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/30" />
                    <XAxis dataKey="weekLabel" interval={0} angle={-25} height={52} textAnchor="end" />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={42} />
                    <Tooltip
                      content={<ChartTooltipContent />}
                      formatter={(value, name) => [`${value ?? "-"}%`, raceNames[name as Race]]}
                    />
                    <Line
                      type="monotone"
                      dataKey="T"
                      stroke={raceColors.T}
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 4, fill: raceColors.T, stroke: "#0f172a", strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="P"
                      stroke={raceColors.P}
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 4, fill: raceColors.P, stroke: "#0f172a", strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Z"
                      stroke={raceColors.Z}
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 4, fill: raceColors.Z, stroke: "#0f172a", strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">선수 수 (시즌 필터 기준)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{seasonPlayerCount.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {seasonId === "__all__"
                  ? "전체 로드 경기에 출전한 서로 다른 선수"
                  : PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[seasonId]
                    ? `${PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[seasonId]} 경기에 출전한 서로 다른 선수`
                    : "이 시즌 경기에 출전한 서로 다른 선수"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">필터 통과 경기(원본)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold font-mono tabular-nums">
                {totalMatchCount.toLocaleString()}/{totalAllMatches.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">전체 로드된 경기 대비 필터 통과 비율</p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
