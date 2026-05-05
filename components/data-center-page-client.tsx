"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  BarChart3,
  ChevronDown,
  Crown,
  Database,
  Filter,
  LineChart as LineChartIcon,
  Percent,
  RotateCcw,
  Swords,
  User,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { resolveMemberIdsByPlayerQuery } from "@/lib/resolve-member-ids-by-player-query"
import { cn } from "@/lib/utils"
import type { Race, Season } from "@/lib/types/tufelo"
import type { SiteHeaderData } from "@/lib/data/site-header"
import type { DataCenterMatch, DataCenterMember } from "@/lib/data/data-center"
import type { DecorativeBadgeAccent } from "@/lib/decorative-badge-accent"
import { decorativeBadgeAccentClasses } from "@/lib/decorative-badge-accent"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { SiteHeader } from "@/components/site-header"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  format,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns"

/** 일자별 Elo 차트 — SVG 내부에서 CSS 변수가 안 먹을 때 검은 점으로 보이는 문제 방지용 고정 색 */
const ELO_WEEK_LINE_COLOR = "#1d4ed8"
const ELO_WEEK_DOT_FILL = "#2563eb"
const ELO_WEEK_DOT_RING = "#000000"

/** 시즌 테이블과 별개로, 프로리그 시즌1·2 경기만 모아 보기 */
/** 시즌 필터: 모든 시즌·비시즌 경기 포함 */
const SEASON_OPTION_ALL = "__all__" as const
const SEASON_OPTION_PROLEAGUE_S1 = "__proleague_s1__" as const
const SEASON_OPTION_PROLEAGUE_S2 = "__proleague_s2__" as const
const SEASON_OPTION_PROLEAGUE_S3_PRESEASON = "__proleague_s3_preseason__" as const
/** DB·API와 동일 — 실제 저장값은 `TFPL_S1` / `TFPL_S2` (app/api/matches). 비교는 대소문자 무시. */
const PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION: Record<string, string> = {
  [SEASON_OPTION_PROLEAGUE_S1]: "TFPL_S1",
  [SEASON_OPTION_PROLEAGUE_S2]: "TFPL_S2",
}

function matchPassesSeasonFilter(seasonId: string, match: DataCenterMatch): boolean {
  if (seasonId === SEASON_OPTION_ALL) return true
  const mt = PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[seasonId]
  if (mt !== undefined) {
    return match.matchType.trim().toUpperCase() === mt.toUpperCase()
  }
  return match.seasonId === seasonId
}

function seasonNameToQueryAlias(name: string): string | null {
  const normalized = name.toLowerCase().replace(/\s+/g, "")
  const seasonNumberMatch = normalized.match(/시즌(\d+)/)
  if (!seasonNumberMatch) return null

  const seasonNumber = seasonNumberMatch[1]
  const isPreseason = normalized.includes("프리시즌") || normalized.includes("preseason")
  if (isPreseason) return `__proleague_s${seasonNumber}_preseason__`
  return `__proleague_s${seasonNumber}__`
}

function isReservedProleagueAlias(alias: string): boolean {
  return (
    PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[alias] !== undefined ||
    /^__proleague_s\d+__$/.test(alias) ||
    /^__proleague_s\d+_preseason__$/.test(alias)
  )
}

function hasDuplicateSeasonAlias(seasons: Season[], alias: string): boolean {
  const count = seasons.reduce((acc, season) => acc + (seasonNameToQueryAlias(season.name) === alias ? 1 : 0), 0)
  return count > 1
}

/** URL 공유 시 시즌 토큰(프로리그 옵션·예약 alias) 대소문자 무시 */
function normalizeSeasonUrlToken(value: string): string {
  const v = value.trim()
  if (v.toLowerCase() === SEASON_OPTION_ALL) return SEASON_OPTION_ALL
  const plKey = Object.keys(PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION).find(
    (k) => k.toLowerCase() === v.toLowerCase(),
  )
  if (plKey) return plKey

  const vl = v.toLowerCase()
  const stdSeason = vl.match(/^__proleague_s(\d+)__$/)
  if (stdSeason) return `__proleague_s${stdSeason[1]}__`
  const preSeason = vl.match(/^__proleague_s(\d+)_preseason__$/)
  if (preSeason) return `__proleague_s${preSeason[1]}_preseason__`
  return v
}

function resolveSeasonIdFromQueryValue(seasons: Season[], value: string): string {
  const normalized = normalizeSeasonUrlToken(value)
  if (PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[normalized] !== undefined) return normalized
  if (!isReservedProleagueAlias(normalized)) return normalized
  const matched = seasons.find((s) => seasonNameToQueryAlias(s.name) === normalized)
  return matched?.id ?? normalized
}

function resolveSeasonQueryValueFromId(seasons: Season[], seasonId: string): string {
  if (PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[seasonId] !== undefined) return seasonId
  const matched = seasons.find((s) => s.id === seasonId)
  if (!matched) return seasonId
  const alias = seasonNameToQueryAlias(matched.name)
  if (!alias || hasDuplicateSeasonAlias(seasons, alias)) return seasonId
  return alias
}

const raceOrder: Race[] = ["T", "P", "Z"]
const raceNames: Record<Race, string> = { T: "테란", P: "프로토스", Z: "저그" }
const raceColors: Record<Race, string> = {
  T: "hsl(217 91% 60%)",
  P: "hsl(42 96% 52%)",
  Z: "hsl(0 84% 60%)",
}
const raceTagClasses: Record<Race, string> = {
  T: "bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-400 border-blue-400/60 dark:border-blue-500/30",
  P: "bg-amber-100 dark:bg-amber-600/20 text-amber-700 dark:text-amber-400 border-amber-400/60 dark:border-amber-500/30",
  Z: "bg-red-100 dark:bg-red-600/20 text-red-700 dark:text-red-400 border-red-400/60 dark:border-red-500/30",
}
const tierTagClasses: Record<number, string> = {
  1: "bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-400/60 dark:border-yellow-500/30",
  2: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-400/60 dark:border-purple-500/30",
  3: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-400/60 dark:border-blue-500/30",
  4: "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-400/60 dark:border-green-500/30",
}

const raceDotYOffset: Record<Race, number> = {
  T: -6,
  P: 0,
  Z: 6,
}

function makeRaceDotShape(race: Race) {
  return (props: { cx?: number; cy?: number; fill?: string }) => {
    const cx = props.cx ?? 0
    const cy = (props.cy ?? 0) + raceDotYOffset[race]
    const fill = props.fill ?? raceColors[race]
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={fill} fillOpacity={0.82} stroke="#000000" strokeWidth={2.8} />
        <circle cx={cx} cy={cy} r={2.2} fill="#ffffff" fillOpacity={0.9} />
      </g>
    )
  }
}

interface DataCenterPageClientProps {
  members: DataCenterMember[]
  matches: DataCenterMatch[]
  seasons: Season[]
  /** 제작자가 부여한 전역 장식 뱃지 */
  decorativeByMember: Record<string, { id: string; label: string; accent: DecorativeBadgeAccent }[]>
  headerData: SiteHeaderData
}

interface PerspectiveRow {
  race: Race
  isWin: boolean
  mapName: string
  seasonKey: string
}

type SummaryRaceWinRateRow = { race: Race; games: number; wins: number; winRate: number }
type SummaryMapRaceWinRateRow = {
  map: string
  total: number
  T: number | null
  P: number | null
  Z: number | null
  tGames: number
  pGames: number
  zGames: number
}
type SummaryResponse = {
  raceWinRates?: SummaryRaceWinRateRow[]
  mapRaceWinRates?: SummaryMapRaceWinRateRow[]
  playerVsPlayerMapWinRates?: Array<{ map: string; games: number; wins: number; winRate: number }>
  totalMatchCount?: number
}

type DetailResponse = {
  recent20Matches?: Array<{ id: string; mapName: string; mapShort: string; isWin: boolean }>
  recent20Summary?: { games: number; wins: number; losses: number; winRate: number }
  recent20MapWins?: Array<{ mapName: string; games: number; wins: number; losses: number; winRate: number }>
  versusEloTrend?: Array<{ weekLabel: string; p1Elo: number | null; p2Elo?: number | null }>
  metaDayRaceTrend?: Array<{ weekLabel: string; T: number | null; P: number | null; Z: number | null }>
  metaEloVolatilityRows?: Array<{
    name: string
    games: number
    currentElo: number
    peakElo: number
    troughElo: number
    range: number
    drawdown: number
    rangeRemainder: number
  }>
}

type MultiOption = { value: string; label: string }

function MultiSelectFilter({
  label,
  options,
  selectedValues,
  onChange,
  open,
  onOpenChange,
  placeholder,
  disabled,
}: {
  label: string
  options: MultiOption[]
  selectedValues: string[]
  onChange: (values: string[]) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  placeholder: string
  disabled?: boolean
}) {
  const isMobile = useIsMobile()
  const selectedLabel =
    selectedValues.length === 0
      ? placeholder
      : selectedValues.length === 1
        ? (options.find((o) => o.value === selectedValues[0])?.label ?? selectedValues[0])
        : `${selectedValues.length}개 선택`

  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "w-full justify-between text-foreground hover:text-foreground dark:hover:text-foreground",
        disabled && "opacity-60",
      )}
      disabled={disabled}
    >
      <span className="truncate text-sm">{selectedLabel}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Button>
  )

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {isMobile ? (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetTrigger asChild>{triggerButton}</SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-xl">
            <SheetHeader className="text-left">
              <SheetTitle>{label}</SheetTitle>
            </SheetHeader>
            <div className="grid gap-1 px-1 pb-6">
              {options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent/60"
                >
                  <Checkbox
                    checked={selectedValues.includes(opt.value)}
                    onCheckedChange={(c) => {
                      const v = c === true
                      if (v) onChange([...selectedValues, opt.value])
                      else onChange(selectedValues.filter((x) => x !== opt.value))
                    }}
                    className="shrink-0"
                  />
                  <span className="text-sm text-foreground">{opt.label}</span>
                </label>
              ))}
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-full justify-center text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onChange([])
                  onOpenChange(false)
                }}
              >
                선택 초기화
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
          <DropdownMenuTrigger asChild disabled={disabled}>
            {triggerButton}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56">
            {options.map((opt) => {
              const checked = selectedValues.includes(opt.value)
              return (
                <DropdownMenuCheckboxItem
                  key={opt.value}
                  checked={checked}
                  onSelect={(e) => e.preventDefault()}
                  className="text-foreground hover:text-foreground focus:text-foreground data-[highlighted]:text-foreground dark:hover:text-foreground dark:focus:text-foreground dark:data-[highlighted]:text-foreground"
                  onCheckedChange={(v) => {
                    if (v) onChange([...selectedValues, opt.value])
                    else onChange(selectedValues.filter((x) => x !== opt.value))
                  }}
                >
                  {opt.label}
                </DropdownMenuCheckboxItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onChange([])
                onOpenChange(false)
              }}
              className="text-muted-foreground hover:text-foreground focus:text-foreground data-[highlighted]:text-foreground dark:hover:text-foreground dark:focus:text-foreground dark:data-[highlighted]:text-foreground"
            >
              선택 초기화
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

function parseMinGames(search: string | null): number {
  const parsed = Number(search ?? "0")
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function parseRecentDays(search: string | null): number {
  const parsed = Number(search ?? "0")
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.round(parsed))
}

/** URL의 맵·매치타입 문자열을 실제 경기 데이터에 있는 대표 표기로 맞춤(대소문자 무시) */
function canonicalizeMatchFieldTokens(
  field: "mapName" | "matchType",
  rawTokens: string[],
  matches: DataCenterMatch[],
): string[] {
  const lowerToCanonical = new Map<string, string>()
  for (const m of matches) {
    const val = field === "mapName" ? m.mapName : m.matchType
    if (!val) continue
    const key = val.toLowerCase()
    if (!lowerToCanonical.has(key)) lowerToCanonical.set(key, val)
  }
  return rawTokens
    .map((t) => {
      const trimmed = t.trim()
      return lowerToCanonical.get(trimmed.toLowerCase()) ?? trimmed
    })
    .filter(Boolean)
}

/** URL 선수 검색어가 한 명으로 확정되면 DB 표기 이름으로 통일(공유 URL 대소문자 정규화) */
function canonicalizePlayerQueryFromUrl(
  members: { id: string; name: string }[],
  raw: string,
): string {
  const ids = resolveMemberIdsByPlayerQuery(members, raw)
  if (ids.length !== 1) return raw
  return members.find((m) => m.id === ids[0])?.name ?? raw
}

/** 선수1(anchorIds)이 출전한 포지션의 member id — 선수1 필터 전용 집계에 사용 */
function anchorPlayerIdFromMatch(match: DataCenterMatch, anchorIds: Set<string>): string | null {
  if (anchorIds.has(match.player1Id)) return match.player1Id
  if (anchorIds.has(match.player2Id)) return match.player2Id
  return null
}

/** 경기 일자 기준 일 단위 키 (정렬용 키 + 표시 라벨) */
function dayKeyFromPlayedDate(playedDate: string): { sortKey: string; label: string } | null {
  const d = parseISO(playedDate)
  if (Number.isNaN(d.getTime())) return null
  const sortKey = format(d, "yyyy-MM-dd")
  const label = format(d, "M.d")
  return { sortKey, label }
}

export function DataCenterPageClient({
  members,
  matches,
  seasons,
  decorativeByMember,
  headerData,
}: DataCenterPageClientProps) {
  const API_DEBOUNCE_MS = 300
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const parseCsvParam = (key: string) =>
    (searchParams.get(key) ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)

  const currentSeason = useMemo(() => seasons.find((s) => s.endDate === null) ?? null, [seasons])
  const [seasonIds, setSeasonIds] = useState(() => {
    const parsed = parseCsvParam("season").map((value) => resolveSeasonIdFromQueryValue(seasons, value))
    if (parsed.length > 0) return parsed
    return currentSeason ? [currentSeason.id] : []
  })
  const [mapNames, setMapNames] = useState(() =>
    canonicalizeMatchFieldTokens("mapName", parseCsvParam("map"), matches),
  )
  const [matchTypes, setMatchTypes] = useState(() =>
    canonicalizeMatchFieldTokens("matchType", parseCsvParam("matchType"), matches),
  )
  const [races, setRaces] = useState<Race[]>(() =>
    parseCsvParam("race")
      .map((v) => v.trim().toUpperCase())
      .filter((v): v is Race => v === "T" || v === "P" || v === "Z"),
  )
  const [tiers, setTiers] = useState(() => parseCsvParam("tier"))
  const [playerFilterEnabled, setPlayerFilterEnabled] = useState(
    searchParams.get("players")?.toLowerCase() === "on",
  )
  const [playerQuery, setPlayerQuery] = useState(() =>
    canonicalizePlayerQueryFromUrl(members, searchParams.get("player") ?? ""),
  )
  const [player2Queries, setPlayer2Queries] = useState(() =>
    parseCsvParam("player2")
      .slice(0, 1)
      .map((q) => canonicalizePlayerQueryFromUrl(members, q)),
  )
  const [minGames, setMinGames] = useState(parseMinGames(searchParams.get("minGames")))
  const [recentDays, setRecentDays] = useState(parseRecentDays(searchParams.get("recentDays")))
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false)
  const [raceMenuOpen, setRaceMenuOpen] = useState(false)
  const [tierMenuOpen, setTierMenuOpen] = useState(false)
  const [mapMenuOpen, setMapMenuOpen] = useState(false)
  const [matchTypeMenuOpen, setMatchTypeMenuOpen] = useState(false)
  const [player2MenuOpen, setPlayer2MenuOpen] = useState(false)
  const [player1AutocompleteOpen, setPlayer1AutocompleteOpen] = useState(false)
  const [player1AutocompleteActiveIndex, setPlayer1AutocompleteActiveIndex] = useState(-1)
  const [mapChartSort, setMapChartSort] = useState<"gamesDesc" | "winRateDesc">("gamesDesc")
  const [metaAnchorRace, setMetaAnchorRace] = useState<Race>("T")
  const [serverSummary, setServerSummary] = useState<SummaryResponse | null>(null)
  const [serverDetail, setServerDetail] = useState<DetailResponse | null>(null)
  const summaryCacheRef = useRef<Map<string, SummaryResponse>>(new Map())
  const detailCacheRef = useRef<Map<string, DetailResponse>>(new Map())

  const maxRecentDays = useMemo(() => {
    const parsed = matches
      .map((m) => parseISO(m.playedDate))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    if (parsed.length === 0) return 30
    const days = Math.ceil((Date.now() - parsed[0].getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(1, Math.min(365, days))
  }, [matches])

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const activePlayerQuery = playerFilterEnabled ? playerQuery : ""
  const activePlayer2Queries = playerFilterEnabled ? player2Queries : []
  const matchedPlayerIds = useMemo(
    () => new Set(resolveMemberIdsByPlayerQuery(members, activePlayerQuery)),
    [members, activePlayerQuery],
  )
  const matchedPlayer2Ids = useMemo(
    () => new Set(activePlayer2Queries.flatMap((name) => resolveMemberIdsByPlayerQuery(members, name))),
    [members, activePlayer2Queries],
  )

  /** 상대선수 모드 토글만 켜도 차트 UI를 선수 기준 모드로 전환 */
  const usePlayer1Charts = playerFilterEnabled
  const hasResolvedPlayer1 = activePlayerQuery.trim().length > 0 && matchedPlayerIds.size > 0
  const playerChartLabel = hasResolvedPlayer1 ? activePlayerQuery.trim() : "선수1"
  const isPlayerModePendingInput = playerFilterEnabled && !hasResolvedPlayer1
  const needsPlayer2Selection = hasResolvedPlayer1 && (activePlayer2Queries.length === 0 || matchedPlayer2Ids.size === 0)

  const seasonOptions = useMemo(() => {
    const allRow = { id: SEASON_OPTION_ALL, label: "전체 시즌" }
    const proLeague = [
      { id: SEASON_OPTION_PROLEAGUE_S1, label: "시즌1 (TFPL_S1)" },
      { id: SEASON_OPTION_PROLEAGUE_S2, label: "시즌2 (TFPL_S2)" },
    ]
    const rows = seasons.map((s) => ({
      id: s.id,
      label: s.endDate === null ? `${s.name} (현재)` : s.name,
    }))
    return [allRow, ...proLeague, ...rows]
  }, [seasons])

  /** 「전체 시즌」과 특정 시즌은 동시 선택 불가 */
  const onSeasonIdsChange = useCallback((next: string[]) => {
    setSeasonIds((prev) => {
      if (next.includes(SEASON_OPTION_ALL) && next.length > 1) {
        if (prev.includes(SEASON_OPTION_ALL)) {
          return next.filter((id) => id !== SEASON_OPTION_ALL)
        }
        return [SEASON_OPTION_ALL]
      }
      return next
    })
  }, [])

  const tierOptions = useMemo(() => {
    const uniq = Array.from(new Set(members.map((m) => m.tier).filter((v): v is number => v !== null)))
      .sort((a, b) => a - b)
      .map((t) => ({ value: String(t), label: `티어 ${t}` }))
    return uniq
  }, [members])

  const seasonFilteredMatches = useMemo(() => {
    if (seasonIds.length === 0) return matches
    return matches.filter((m) => seasonIds.some((sid) => matchPassesSeasonFilter(sid, m)))
  }, [matches, seasonIds])

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
    if (seasonIds.length !== 1) return null
    const selectedId = seasonIds[0]
    if (selectedId === SEASON_OPTION_ALL) return null
    if (PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[selectedId] !== undefined) return null
    return seasons.find((s) => s.id === selectedId) ?? null
  }, [seasonIds, seasons])

  function resetAllFilters() {
    setSeasonIds(currentSeason ? [currentSeason.id] : [])
    setMapNames([])
    setMatchTypes([])
    setRaces([])
    setTiers([])
    setPlayerFilterEnabled(false)
    setPlayerQuery("")
    setPlayer2Queries([])
    setMinGames(0)
    setRecentDays(0)
    setSeasonMenuOpen(false)
    setRaceMenuOpen(false)
    setTierMenuOpen(false)
    setMapMenuOpen(false)
    setMatchTypeMenuOpen(false)
    setPlayer2MenuOpen(false)
  }

  const mapOptions = useMemo(() => {
    const rows = Array.from(new Set(seasonFilteredMatches.map((m) => m.mapName)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ko"))
    return rows
  }, [seasonFilteredMatches])

  const matchTypeOptions = useMemo(() => {
    const rows = Array.from(new Set(seasonFilteredMatches.map((m) => m.matchType)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ko"))
    return rows
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

  const player1AutocompleteOptions = useMemo(() => {
    const q = playerQuery.trim().toLowerCase()
    const namesInSeason = new Set<string>()
    for (const match of seasonFilteredMatches) {
      const p1 = memberById.get(match.player1Id)?.name
      const p2 = memberById.get(match.player2Id)?.name
      if (p1) namesInSeason.add(p1)
      if (p2) namesInSeason.add(p2)
    }
    const uniqueNames = Array.from(namesInSeason)
    if (q.length === 0) {
      return uniqueNames.sort((a, b) => a.localeCompare(b, "ko")).slice(0, 12)
    }
    return uniqueNames
      .filter((name) => name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return a.localeCompare(b, "ko")
      })
      .slice(0, 12)
  }, [playerQuery, seasonFilteredMatches, memberById])

  useEffect(() => {
    const next = new URLSearchParams()
    if (seasonIds.length > 0) next.set("season", seasonIds.map((seasonId) => resolveSeasonQueryValueFromId(seasons, seasonId)).join(","))
    if (mapNames.length > 0) next.set("map", mapNames.join(","))
    if (matchTypes.length > 0) next.set("matchType", matchTypes.join(","))
    if (races.length > 0) next.set("race", races.join(","))
    if (tiers.length > 0) next.set("tier", tiers.join(","))
    if (playerFilterEnabled) next.set("players", "on")
    if (playerFilterEnabled && playerQuery.trim()) next.set("player", playerQuery.trim())
    if (playerFilterEnabled && player2Queries.length > 0) next.set("player2", player2Queries.join(","))
    if (minGames !== 0) next.set("minGames", String(minGames))
    if (recentDays !== 0) next.set("recentDays", String(recentDays))
    const query = next.toString()
    const current = searchParams.toString()
    if (query === current) return
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [seasonIds, mapNames, matchTypes, races, tiers, playerFilterEnabled, playerQuery, player2Queries, minGames, recentDays, pathname, router, searchParams])

  useEffect(() => {
    setMapNames((prev) => {
      const next = prev.filter((m) => mapOptions.includes(m))
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev
      return next
    })
  }, [mapOptions])
  useEffect(() => {
    setMatchTypes((prev) => {
      const next = prev.filter((m) => matchTypeOptions.includes(m))
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev
      return next
    })
  }, [matchTypeOptions])
  useEffect(() => {
    const valid = new Set(tierOptions.map((o) => o.value))
    setTiers((prev) => {
      const next = prev.filter((t) => valid.has(t))
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev
      return next
    })
  }, [tierOptions])
  useEffect(() => {
    if (!playerFilterEnabled) return
    setPlayer2Queries((prev) => {
      const next = prev.filter((name) => player2Options.some((opt) => opt.name === name)).slice(0, 1)
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev
      return next
    })
  }, [playerFilterEnabled, player2Options])

  const dataCenterQueryString = useMemo(() => {
    const params = new URLSearchParams()
    const seasonForApi = seasonIds.filter((id) => id !== SEASON_OPTION_ALL)
    if (seasonForApi.length > 0) params.set("season", seasonForApi.join(","))
    if (mapNames.length > 0) params.set("map", mapNames.join(","))
    if (matchTypes.length > 0) params.set("matchType", matchTypes.join(","))
    if (races.length > 0) params.set("race", races.join(","))
    if (tiers.length > 0) params.set("tier", tiers.join(","))
    if (playerFilterEnabled) params.set("players", "on")
    if (playerQuery.trim()) params.set("player", playerQuery.trim())
    if (player2Queries.length > 0) params.set("player2", player2Queries[0] ?? "")
    if (minGames > 0) params.set("minGames", String(minGames))
    if (recentDays > 0) params.set("recentDays", String(recentDays))
    return params.toString()
  }, [
    seasonIds,
    mapNames,
    matchTypes,
    races,
    tiers,
    playerFilterEnabled,
    playerQuery,
    player2Queries,
    minGames,
    recentDays,
  ])

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (seasonIds.length > 0 && !seasonIds.some((id) => matchPassesSeasonFilter(id, match))) return false
      if (mapNames.length > 0 && !mapNames.includes(match.mapName)) return false
      if (matchTypes.length > 0 && !matchTypes.includes(match.matchType)) return false
      if (recentDays > 0) {
        const cutoff = startOfDay(subDays(new Date(), recentDays - 1))
        const playedAt = parseISO(match.playedDate)
        if (Number.isNaN(playedAt.getTime()) || playedAt < cutoff) return false
      }
      const hasPlayer1Filter = activePlayerQuery.trim().length > 0
      const hasPlayer2Filter = activePlayer2Queries.length > 0
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
      if (races.length > 0) {
        const p1Race = memberById.get(match.player1Id)?.race
        const p2Race = memberById.get(match.player2Id)?.race
        // 상대전적 모드(선수1 입력)에서는 종족 필터를 "선수1의 상대 종족" 기준으로 해석합니다.
        if (hasPlayer1Filter && matchedPlayerIds.size > 0) {
          const opponentRaces: Race[] = []
          if (matchedPlayerIds.has(match.player1Id) && p2Race) opponentRaces.push(p2Race)
          if (matchedPlayerIds.has(match.player2Id) && p1Race) opponentRaces.push(p1Race)
          if (opponentRaces.length === 0) return false
          if (!opponentRaces.some((race) => races.includes(race))) return false
        } else {
          if ((!p1Race || !races.includes(p1Race)) && (!p2Race || !races.includes(p2Race))) return false
        }
      }
      if (tiers.length > 0) {
        const p1Tier = memberById.get(match.player1Id)?.tier
        const p2Tier = memberById.get(match.player2Id)?.tier
        // 상대전적 모드(선수1 입력)에서는 티어 필터도 "선수1의 상대 티어" 기준으로 해석합니다.
        if (hasPlayer1Filter && matchedPlayerIds.size > 0) {
          const opponentTiers: string[] = []
          if (matchedPlayerIds.has(match.player1Id) && p2Tier !== null && p2Tier !== undefined) {
            opponentTiers.push(String(p2Tier))
          }
          if (matchedPlayerIds.has(match.player2Id) && p1Tier !== null && p1Tier !== undefined) {
            opponentTiers.push(String(p1Tier))
          }
          if (opponentTiers.length === 0) return false
          if (!opponentTiers.some((tier) => tiers.includes(tier))) return false
        } else {
          const hasP1 = p1Tier !== null && p1Tier !== undefined && tiers.includes(String(p1Tier))
          const hasP2 = p2Tier !== null && p2Tier !== undefined && tiers.includes(String(p2Tier))
          if (!hasP1 && !hasP2) return false
        }
      }
      return true
    })
  }, [
    matches,
    seasonIds,
    mapNames,
    matchTypes,
    races,
    tiers,
    activePlayerQuery,
    activePlayer2Queries,
    matchedPlayerIds,
    matchedPlayer2Ids,
    recentDays,
    memberById,
  ])

  useEffect(() => {
    const controller = new AbortController()
    const cacheKey = dataCenterQueryString
    const cached = detailCacheRef.current.get(cacheKey)
    if (cached) {
      setServerDetail(cached)
      return () => controller.abort()
    }
    const loadDetail = async () => {
      try {
        const res = await fetch(`/api/data-center/detail?${cacheKey}`, {
          signal: controller.signal,
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`detail fetch failed: ${res.status}`)
        const data = (await res.json()) as DetailResponse
        if (!controller.signal.aborted) {
          detailCacheRef.current.set(cacheKey, data)
          setServerDetail(data)
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          console.error("데이터센터 상세 집계 로드 실패:", e)
          setServerDetail(null)
        }
      }
    }
    const timer = setTimeout(loadDetail, API_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [API_DEBOUNCE_MS, dataCenterQueryString])

  useEffect(() => {
    const controller = new AbortController()
    const cacheKey = dataCenterQueryString
    const cached = summaryCacheRef.current.get(cacheKey)
    if (cached) {
      setServerSummary(cached)
      return () => controller.abort()
    }
    const loadSummary = async () => {
      try {
        const res = await fetch(`/api/data-center/summary?${cacheKey}`, {
          signal: controller.signal,
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`summary fetch failed: ${res.status}`)
        const data = (await res.json()) as SummaryResponse
        if (!controller.signal.aborted) {
          summaryCacheRef.current.set(cacheKey, data)
          setServerSummary(data)
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          console.error("데이터센터 집계 로드 실패:", e)
          setServerSummary(null)
        }
      }
    }
    const timer = setTimeout(loadSummary, API_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [API_DEBOUNCE_MS, dataCenterQueryString])

  const perspectiveRows = useMemo(() => {
    const rows: PerspectiveRow[] = []
    for (const match of filteredMatches) {
      const p1 = memberById.get(match.player1Id)
      const p2 = memberById.get(match.player2Id)
      if (!p1 || !p2) continue

      /** 시즌 테이블 UUID 없이도 메타 차트에 포함 — TFPL 등은 match_type만 있고 season_id 가 null 인 경우가 많음 */
      const seasonKey = match.seasonId ?? "__no_db_season__"
      const hasPlayer1Filter = activePlayerQuery.trim().length > 0 && matchedPlayerIds.size > 0
      const hasPlayer2Filter = activePlayer2Queries.length > 0 && matchedPlayer2Ids.size > 0
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
  }, [filteredMatches, memberById, activePlayerQuery, activePlayer2Queries, matchedPlayerIds, matchedPlayer2Ids])

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

  /** 메타: 선택 종족 기준(vs 종족) 승률 */
  const metaAnchorVsRaceWinRates = useMemo(() => {
    const grouped: Record<Race, { race: Race; games: number; wins: number; winRate: number }> = {
      T: { race: "T", games: 0, wins: 0, winRate: 0 },
      P: { race: "P", games: 0, wins: 0, winRate: 0 },
      Z: { race: "Z", games: 0, wins: 0, winRate: 0 },
    }
    for (const match of filteredMatches) {
      const p1 = memberById.get(match.player1Id)
      const p2 = memberById.get(match.player2Id)
      if (!p1 || !p2) continue

      if (p1.race === metaAnchorRace) {
        grouped[p2.race].games += 1
        if (match.winnerId === match.player1Id) grouped[p2.race].wins += 1
      }
      if (p2.race === metaAnchorRace) {
        grouped[p1.race].games += 1
        if (match.winnerId === match.player2Id) grouped[p1.race].wins += 1
      }
    }
    return raceOrder
      .filter((race) => race !== metaAnchorRace)
      .map((race) => {
        const item = grouped[race]
        return {
          ...item,
          winRate: item.games > 0 ? Number(((item.wins / item.games) * 100).toFixed(1)) : 0,
        }
      })
  }, [filteredMatches, memberById, metaAnchorRace])

  const localRaceWinRates = usePlayer1Charts ? playerVsOpponentRaceWinRates : metaAnchorVsRaceWinRates
  /** 서버 raceWinRates 는 종족별 풀 관점 집계라 메타 토글(기준 종족 vs 상대 종족)·선수 상대종족 차트와 의미가 다름 — 항상 클라이언트 집계 사용 */
  const raceWinRates = localRaceWinRates
  const serverPvpMapWinRates = serverSummary?.playerVsPlayerMapWinRates ?? []
  const raceStackChartData = useMemo(
    () =>
      raceWinRates.map((row) => {
        const losses = Math.max(0, row.games - row.wins)
        const xLabel = `vs ${raceNames[row.race]}`
        const winRateLabel = `${row.winRate.toFixed(row.winRate % 1 === 0 ? 0 : 1)}%`
        return {
          ...row,
          losses,
          xLabel,
          winRateLabel,
        }
      }),
    [raceWinRates],
  )
  const mapRaceGamesDonutData = useMemo(
    () =>
      raceOrder
        .map((race) => {
          const row = raceWinRates.find((x) => x.race === race)
          return {
            race,
            label: raceNames[race],
            games: row?.games ?? 0,
            fill: raceColors[race],
          }
        })
        .filter((row) => row.games > 0),
    [raceWinRates],
  )
  const mapRaceGamesTotal = useMemo(
    () => mapRaceGamesDonutData.reduce((acc, row) => acc + row.games, 0),
    [mapRaceGamesDonutData],
  )
  const metaDonutStats = useMemo(
    () =>
      raceOrder.map((r) => {
        const row = metaRaceWinRates.find((x) => x.race === r)
        return {
          race: r,
          winRate: row?.winRate ?? 0,
          games: row?.games ?? 0,
        }
      }),
    [metaRaceWinRates],
  )

  const localMetaMapRaceWinRates = useMemo(() => {
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
  const metaMapRaceWinRates =
    (serverSummary?.mapRaceWinRates as typeof localMetaMapRaceWinRates | undefined) ?? localMetaMapRaceWinRates

  /** 선수1 기준: 맵별 상대 종족(T/P/Z) 승률 */
  const playerMapRaceWinRates = useMemo(() => {
    const mapRace = new Map<string, Record<Race, { games: number; wins: number }>>()
    for (const match of filteredMatches) {
      const anchorId = anchorPlayerIdFromMatch(match, matchedPlayerIds)
      if (!anchorId) continue
      const opp = anchorId === match.player1Id ? memberById.get(match.player2Id) : memberById.get(match.player1Id)
      if (!opp) continue
      const won = match.winnerId === anchorId
      const prev = mapRace.get(match.mapName) ?? {
        T: { games: 0, wins: 0 },
        P: { games: 0, wins: 0 },
        Z: { games: 0, wins: 0 },
      }
      prev[opp.race].games += 1
      if (won) prev[opp.race].wins += 1
      mapRace.set(match.mapName, prev)
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
  }, [filteredMatches, matchedPlayerIds, memberById, minGames])

  const playerMapDotSeries = useMemo(
    () => ({
      T: playerMapRaceWinRates
        .filter((row) => row.T !== null)
        .map((row) => ({ map: row.map, winRate: row.T as number, games: row.tGames, race: "T" as Race })),
      P: playerMapRaceWinRates
        .filter((row) => row.P !== null)
        .map((row) => ({ map: row.map, winRate: row.P as number, games: row.pGames, race: "P" as Race })),
      Z: playerMapRaceWinRates
        .filter((row) => row.Z !== null)
        .map((row) => ({ map: row.map, winRate: row.Z as number, games: row.zGames, race: "Z" as Race })),
    }),
    [playerMapRaceWinRates],
  )
  const playerMapRows = useMemo(() => playerMapRaceWinRates.map((row) => row.map), [playerMapRaceWinRates])
  const playerMapMasteryData = useMemo(() => {
    type MapPerf = { games: number; wins: number; losses: number; winRate: number }

    const buildMapPerf = (anchorIds: Set<string> | null): Map<string, MapPerf> => {
      const byMap = new Map<string, { games: number; wins: number }>()
      for (const match of filteredMatches) {
        if (anchorIds === null) {
          // 클랜 평균: 한 경기에서 양 선수 관점을 모두 반영
          const p1 = byMap.get(match.mapName) ?? { games: 0, wins: 0 }
          p1.games += 1
          if (match.winnerId === match.player1Id) p1.wins += 1
          byMap.set(match.mapName, p1)

          const p2 = byMap.get(match.mapName) ?? { games: 0, wins: 0 }
          p2.games += 1
          if (match.winnerId === match.player2Id) p2.wins += 1
          byMap.set(match.mapName, p2)
          continue
        }

        const anchorId = anchorPlayerIdFromMatch(match, anchorIds)
        if (!anchorId) continue
        const prev = byMap.get(match.mapName) ?? { games: 0, wins: 0 }
        prev.games += 1
        if (match.winnerId === anchorId) prev.wins += 1
        byMap.set(match.mapName, prev)
      }

      const rows = [...byMap.values()].filter((x) => x.games >= minGames)
      const result = new Map<string, MapPerf>()
      for (const [map, stat] of byMap.entries()) {
        if (stat.games < minGames) continue
        const losses = Math.max(0, stat.games - stat.wins)
        const winRate = stat.games > 0 ? Number(((stat.wins / stat.games) * 100).toFixed(1)) : 0
        result.set(map, { games: stat.games, wins: stat.wins, losses, winRate })
      }
      return result
    }

    if (!hasResolvedPlayer1) {
      return [] as Array<{
        map: string
        p1Wins: number
        p1Losses: number
        p1WinRate: number
        p1Games: number
        compareWins: number
        compareLosses: number
        compareWinRate: number
        compareGames: number
      }>
    }

    const hasHeadToHead = hasResolvedPlayer1 && activePlayer2Queries.length > 0 && matchedPlayer2Ids.size > 0
    if (hasHeadToHead && serverPvpMapWinRates.length > 0) {
      return [...serverPvpMapWinRates]
        .sort((a, b) => b.games - a.games || a.map.localeCompare(b.map, "ko"))
        .slice(0, 10)
        .map((row) => ({
          map: row.map,
          p1Wins: row.wins,
          p1Losses: Math.max(0, row.games - row.wins),
          p1WinRate: row.winRate,
          p1Games: row.games,
          compareWins: Math.max(0, row.games - row.wins),
          compareLosses: row.wins,
          compareWinRate: Number((100 - row.winRate).toFixed(1)),
          compareGames: row.games,
        }))
    }

    const p1Perf = buildMapPerf(matchedPlayerIds)
    const p2Perf = hasHeadToHead ? buildMapPerf(matchedPlayer2Ids) : null
    const clanPerf = hasHeadToHead ? null : buildMapPerf(null)
    const comparePerf = p2Perf ?? clanPerf
    if (!comparePerf) return []

    // 왜곡 방지: 비교 대상 모두 데이터가 있는 맵(교집합)만 사용
    const mapCandidates = [...p1Perf.keys()]
      .filter((map) => comparePerf.has(map))
      .map((map) => {
        const p1 = p1Perf.get(map)!
        const cp = comparePerf.get(map)!
        return {
          map,
          p1,
          cp,
          score: p1.games + cp.games,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return mapCandidates.map((row) => ({
      map: row.map,
      p1Wins: row.p1.wins,
      p1Losses: row.p1.losses,
      p1WinRate: row.p1.winRate,
      p1Games: row.p1.games,
      compareWins: row.cp.wins,
      compareLosses: row.cp.losses,
      compareWinRate: row.cp.winRate,
      compareGames: row.cp.games,
    }))
  }, [
    hasResolvedPlayer1,
    filteredMatches,
    matchedPlayerIds,
    matchedPlayer2Ids,
    activePlayer2Queries,
    minGames,
    serverPvpMapWinRates,
  ])
  const sortedPlayerMapMasteryData = useMemo(() => {
    const rows = [...playerMapMasteryData]
    if (mapChartSort === "winRateDesc") {
      rows.sort((a, b) => b.p1WinRate - a.p1WinRate || b.p1Games - a.p1Games || a.map.localeCompare(b.map, "ko"))
      return rows
    }
    rows.sort((a, b) => b.p1Games - a.p1Games || b.p1WinRate - a.p1WinRate || a.map.localeCompare(b.map, "ko"))
    return rows
  }, [playerMapMasteryData, mapChartSort])
  const metaMapDotSeries = useMemo(
    () => ({
      T: metaMapRaceWinRates
        .filter((row) => row.T !== null)
        .map((row) => ({ map: row.map, winRate: row.T as number, games: row.tGames, race: "T" as Race })),
      P: metaMapRaceWinRates
        .filter((row) => row.P !== null)
        .map((row) => ({ map: row.map, winRate: row.P as number, games: row.pGames, race: "P" as Race })),
      Z: metaMapRaceWinRates
        .filter((row) => row.Z !== null)
        .map((row) => ({ map: row.map, winRate: row.Z as number, games: row.zGames, race: "Z" as Race })),
    }),
    [metaMapRaceWinRates],
  )
  const metaMapRows = useMemo(() => metaMapRaceWinRates.map((row) => row.map), [metaMapRaceWinRates])

  /** 메타: 최근 14일 일자별 클랜 풀 종족 승률 추이 */
  const localMetaDayRaceTrend = useMemo(() => {
    const grouped = new Map<string, { sortKey: string; label: string; stats: Record<Race, { games: number; wins: number }> }>()
    const cutoff = startOfDay(subDays(new Date(), 13))

    for (const match of filteredMatches) {
      const playedAt = parseISO(match.playedDate)
      if (Number.isNaN(playedAt.getTime()) || playedAt < cutoff) continue
      const day = dayKeyFromPlayedDate(match.playedDate)
      if (!day) continue

      const p1 = memberById.get(match.player1Id)
      const p2 = memberById.get(match.player2Id)
      if (!p1 || !p2) continue

      const hasPlayer1Filter = activePlayerQuery.trim().length > 0 && matchedPlayerIds.size > 0
      const hasPlayer2Filter = activePlayer2Queries.length > 0 && matchedPlayer2Ids.size > 0
      const useAnchorPlayerIds = hasPlayer1Filter ? matchedPlayerIds : hasPlayer2Filter ? matchedPlayer2Ids : null

      let bucket = grouped.get(day.sortKey)
      if (!bucket) {
        bucket = {
          sortKey: day.sortKey,
          label: day.label,
          stats: {
            T: { games: 0, wins: 0 },
            P: { games: 0, wins: 0 },
            Z: { games: 0, wins: 0 },
          },
        }
        grouped.set(day.sortKey, bucket)
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

    return sorted.slice(-14).map(({ label, stats }) => ({
      weekLabel: label,
      T: stats.T.games >= minGames ? Number(((stats.T.wins / stats.T.games) * 100).toFixed(1)) : null,
      P: stats.P.games >= minGames ? Number(((stats.P.wins / stats.P.games) * 100).toFixed(1)) : null,
      Z: stats.Z.games >= minGames ? Number(((stats.Z.wins / stats.Z.games) * 100).toFixed(1)) : null,
    }))
  }, [
    filteredMatches,
    memberById,
    activePlayerQuery,
    activePlayer2Queries,
    matchedPlayerIds,
    matchedPlayer2Ids,
    minGames,
  ])

  /** 메타: 최근 7일 ELO 변동성 (변동폭/최고점 대비 현재 하락폭) */
  const localMetaEloVolatilityRows = useMemo(() => {
    if (usePlayer1Charts) return [] as Array<{
      name: string
      games: number
      currentElo: number
      peakElo: number
      troughElo: number
      range: number
      drawdown: number
    }>

    type EloPoint = { playedDate: string; id: string; elo: number }
    const byMember = new Map<string, EloPoint[]>()
    const cutoff = startOfDay(subDays(new Date(), 6))

    for (const match of filteredMatches) {
      const playedAt = parseISO(match.playedDate)
      if (Number.isNaN(playedAt.getTime()) || playedAt < cutoff) continue

      const p1Before = Number(match.player1EloBefore)
      const p1Delta = Number(match.player1EloDelta)
      if (Number.isFinite(p1Before) && Number.isFinite(p1Delta)) {
        const arr = byMember.get(match.player1Id) ?? []
        arr.push({ playedDate: match.playedDate, id: match.id, elo: p1Before + p1Delta })
        byMember.set(match.player1Id, arr)
      }

      const p2Before = Number(match.player2EloBefore)
      const p2Delta = Number(match.player2EloDelta)
      if (Number.isFinite(p2Before) && Number.isFinite(p2Delta)) {
        const arr = byMember.get(match.player2Id) ?? []
        arr.push({ playedDate: match.playedDate, id: match.id, elo: p2Before + p2Delta })
        byMember.set(match.player2Id, arr)
      }
    }

    return Array.from(byMember.entries())
      .map(([memberId, rows]) => {
        if (rows.length < 2) return null
        rows.sort((a, b) => a.playedDate.localeCompare(b.playedDate) || a.id.localeCompare(b.id))
        const values = rows.map((r) => r.elo)
        const peakElo = Math.max(...values)
        const troughElo = Math.min(...values)
        const currentElo = rows[rows.length - 1]?.elo ?? values[values.length - 1]
        const range = peakElo - troughElo
        const drawdown = Math.max(0, peakElo - currentElo)
        const rangeRemainder = Math.max(0, range - drawdown)
        const member = memberById.get(memberId)
        return {
          name: member?.name ?? "알 수 없음",
          games: rows.length,
          currentElo,
          peakElo,
          troughElo,
          range,
          drawdown,
          rangeRemainder,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.range - a.range || b.drawdown - a.drawdown || b.games - a.games)
      .slice(0, 10)
  }, [usePlayer1Charts, filteredMatches, memberById])

  const buildPlayerDayEloTrend = (anchorIds: Set<string>) => {
    type Row = { sortKey: string; label: string; playedDate: string; id: string; eloScore: number }
    const rows: Row[] = []
    const cutoff = startOfDay(subDays(new Date(), 13))

    for (const match of filteredMatches) {
      if (selectedSeason) {
        if (match.playedDate < selectedSeason.startDate) continue
        if (selectedSeason.endDate !== null && match.playedDate > selectedSeason.endDate) continue
      }
      const playedAt = parseISO(match.playedDate)
      if (Number.isNaN(playedAt.getTime()) || playedAt < cutoff) continue
      const anchorId = anchorPlayerIdFromMatch(match, anchorIds)
      if (!anchorId) continue
      const before = anchorId === match.player1Id ? match.player1EloBefore : match.player2EloBefore
      const delta = anchorId === match.player1Id ? match.player1EloDelta : match.player2EloDelta
      if (before === null || delta === null) continue
      const b = Number(before)
      const d = Number(delta)
      if (!Number.isFinite(b) || !Number.isFinite(d)) continue
      const eloScore = b + d
      const day = dayKeyFromPlayedDate(match.playedDate)
      if (!day) continue
      rows.push({
        sortKey: day.sortKey,
        label: day.label,
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
    const lastFourteen = sortedKeys.slice(-14)
    return lastFourteen.map((key) => {
      const v = lastInWeek.get(key)!
      return {
        dayKey: key,
        weekLabel: v.label,
        eloScore: Number(v.eloScore.toFixed(1)),
      }
    })
  }

  /** 선수1 기준: 최근 14일 일자별 경기 종료 직후 Elo 점수 (해당 일 마지막 경기 기준) */
  const playerDayEloTrend = useMemo(() => buildPlayerDayEloTrend(matchedPlayerIds), [filteredMatches, matchedPlayerIds, selectedSeason])

  /** 선수2 기준: 상대전적 모드에서 최근 14일 일자별 Elo */
  const player2DayEloTrend = useMemo(() => buildPlayerDayEloTrend(matchedPlayer2Ids), [filteredMatches, matchedPlayer2Ids, selectedSeason])

  const isHeadToHeadMode = hasResolvedPlayer1 && activePlayer2Queries.length > 0 && matchedPlayer2Ids.size > 0
  const localVersusEloTrend = useMemo(() => {
    if (!isHeadToHeadMode) return playerDayEloTrend.map((r) => ({ weekLabel: r.weekLabel, p1Elo: r.eloScore }))
    const byDay = new Map<string, { weekLabel: string; p1Elo?: number; p2Elo?: number }>()
    for (const r of playerDayEloTrend) byDay.set(r.dayKey, { weekLabel: r.weekLabel, p1Elo: r.eloScore })
    for (const r of player2DayEloTrend) {
      const prev = byDay.get(r.dayKey) ?? { weekLabel: r.weekLabel }
      prev.p2Elo = r.eloScore
      byDay.set(r.dayKey, prev)
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => ({ weekLabel: v.weekLabel, p1Elo: v.p1Elo ?? null, p2Elo: v.p2Elo ?? null }))
  }, [isHeadToHeadMode, playerDayEloTrend, player2DayEloTrend])

  const chartConfig = {
    T: { label: "테란", color: raceColors.T },
    P: { label: "프로토스", color: raceColors.P },
    Z: { label: "저그", color: raceColors.Z },
  } satisfies ChartConfig

  const eloWeekChartConfig = {
    eloScore: { label: "Elo 점수", color: ELO_WEEK_LINE_COLOR },
  } satisfies ChartConfig

  const buildPlayerCardStats = (anchorIds: Set<string>) => {
    if (anchorIds.size === 0) {
      return { games: 0, wins: 0, winRate: 0, vsT: 0, vsP: 0, vsZ: 0, member: null as DataCenterMember | null }
    }
    const member = members.find((m) => anchorIds.has(m.id)) ?? null
    let games = 0
    let wins = 0
    const vs: Record<Race, { games: number; wins: number }> = {
      T: { games: 0, wins: 0 },
      P: { games: 0, wins: 0 },
      Z: { games: 0, wins: 0 },
    }
    for (const match of seasonFilteredMatches) {
      const anchorId = anchorPlayerIdFromMatch(match, anchorIds)
      if (!anchorId) continue
      games += 1
      const won = match.winnerId === anchorId
      if (won) wins += 1
      const opp = anchorId === match.player1Id ? memberById.get(match.player2Id) : memberById.get(match.player1Id)
      if (!opp) continue
      vs[opp.race].games += 1
      if (won) vs[opp.race].wins += 1
    }
    const pct = (w: number, g: number) => (g > 0 ? Number(((w / g) * 100).toFixed(1)) : 0)
    return {
      member,
      games,
      wins,
      winRate: pct(wins, games),
      vsT: pct(vs.T.wins, vs.T.games),
      vsP: pct(vs.P.wins, vs.P.games),
      vsZ: pct(vs.Z.wins, vs.Z.games),
    }
  }

  const player1CardStats = useMemo(() => buildPlayerCardStats(matchedPlayerIds), [matchedPlayerIds, filteredMatches, memberById, members])
  const player2CardStats = useMemo(() => buildPlayerCardStats(matchedPlayer2Ids), [matchedPlayer2Ids, filteredMatches, memberById, members])

  const headToHeadStats = useMemo(() => {
    if (hasResolvedPlayer1 && activePlayer2Queries.length > 0 && matchedPlayer2Ids.size > 0 && serverPvpMapWinRates.length > 0) {
      const games = serverPvpMapWinRates.reduce((acc, row) => acc + row.games, 0)
      const wins = serverPvpMapWinRates.reduce((acc, row) => acc + row.wins, 0)
      const losses = Math.max(0, games - wins)
      return {
        games,
        wins,
        losses,
        winRate: games > 0 ? Number(((wins / games) * 100).toFixed(1)) : 0,
      }
    }
    if (matchedPlayerIds.size === 0 || matchedPlayer2Ids.size === 0) return { games: 0, wins: 0, losses: 0, winRate: 0 }
    let games = 0
    let wins = 0
    for (const match of filteredMatches) {
      const pairMatched =
        (matchedPlayerIds.has(match.player1Id) && matchedPlayer2Ids.has(match.player2Id)) ||
        (matchedPlayerIds.has(match.player2Id) && matchedPlayer2Ids.has(match.player1Id))
      if (!pairMatched) continue
      games += 1
      const anchorId = anchorPlayerIdFromMatch(match, matchedPlayerIds)
      if (anchorId && match.winnerId === anchorId) wins += 1
    }
    const losses = Math.max(0, games - wins)
    return {
      games,
      wins,
      losses,
      winRate: games > 0 ? Number(((wins / games) * 100).toFixed(1)) : 0,
    }
  }, [hasResolvedPlayer1, activePlayer2Queries, matchedPlayerIds, matchedPlayer2Ids, filteredMatches, serverPvpMapWinRates])

  const headToHeadRisk = useMemo(() => {
    if (headToHeadStats.games === 0) return { label: "판정불가", tone: "bg-muted text-muted-foreground" }
    if (headToHeadStats.winRate < 30)
      return {
        label: "매우높음",
        tone: "border border-red-300 bg-red-100 text-red-700 dark:border-red-500/35 dark:bg-red-500/15 dark:text-red-300",
      }
    if (headToHeadStats.winRate < 45)
      return {
        label: "높음",
        tone: "border border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-500/35 dark:bg-orange-500/15 dark:text-orange-300",
      }
    if (headToHeadStats.winRate < 60)
      return {
        label: "보통",
        tone: "border border-yellow-300 bg-yellow-100 text-yellow-700 dark:border-yellow-500/35 dark:bg-yellow-500/15 dark:text-yellow-300",
      }
    if (headToHeadStats.winRate < 70)
      return {
        label: "낮음",
        tone: "border border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300",
      }
    return {
      label: "매우낮음",
      tone: "border border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300",
    }
  }, [headToHeadStats])

  const nemesis = useMemo(() => {
    if (!hasResolvedPlayer1) return null as null | { name: string; race: Race; tier: number | null; games: number; winRate: number }
    const byOpponent = new Map<string, { games: number; wins: number }>()
    for (const match of filteredMatches) {
      const anchorId = anchorPlayerIdFromMatch(match, matchedPlayerIds)
      if (!anchorId) continue
      const opponentId = anchorId === match.player1Id ? match.player2Id : match.player1Id
      const won = match.winnerId === anchorId
      const prev = byOpponent.get(opponentId) ?? { games: 0, wins: 0 }
      prev.games += 1
      if (won) prev.wins += 1
      byOpponent.set(opponentId, prev)
    }

    const candidates = [...byOpponent.entries()]
      .map(([oppId, s]) => {
        const m = memberById.get(oppId)
        const winRate = s.games > 0 ? Number(((s.wins / s.games) * 100).toFixed(1)) : 0
        return {
          id: oppId,
          name: m?.name ?? "알 수 없음",
          race: m?.race ?? "T",
          tier: m?.tier ?? null,
          games: s.games,
          winRate,
        }
      })
      .filter((x) => x.games >= 5)
      // 위험도 기준: "매우높음" 이상만 천적 (승률 30% 미만)
      .filter((x) => x.winRate < 30)
      .sort((a, b) => a.winRate - b.winRate || b.games - a.games || a.name.localeCompare(b.name, "ko"))

    return candidates[0] ?? null
  }, [hasResolvedPlayer1, filteredMatches, matchedPlayerIds, memberById])
  const rivalTopRankById = useMemo(() => {
    if (!hasResolvedPlayer1) return new Map<string, number>()
    const byOpponent = new Map<string, { games: number; wins: number }>()
    for (const match of filteredMatches) {
      const anchorId = anchorPlayerIdFromMatch(match, matchedPlayerIds)
      if (!anchorId) continue
      const opponentId = anchorId === match.player1Id ? match.player2Id : match.player1Id
      const won = match.winnerId === anchorId
      const prev = byOpponent.get(opponentId) ?? { games: 0, wins: 0 }
      prev.games += 1
      if (won) prev.wins += 1
      byOpponent.set(opponentId, prev)
    }

    const top3 = [...byOpponent.entries()]
      .map(([oppId, stat]) => ({
        id: oppId,
        name: memberById.get(oppId)?.name ?? "알 수 없음",
        games: stat.games,
        winRate: stat.games > 0 ? Number(((stat.wins / stat.games) * 100).toFixed(1)) : 0,
      }))
      // 위험도 "높음~보통" 구간만: 30% 이상 60% 미만
      .filter((x) => x.winRate >= 30 && x.winRate < 60)
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, "ko"))
      .slice(0, 3)

    const rankMap = new Map<string, number>()
    top3.forEach((row, idx) => rankMap.set(row.id, idx + 1))
    return rankMap
  }, [hasResolvedPlayer1, filteredMatches, matchedPlayerIds, memberById])
  const tierRankBadgeByMemberId = useMemo(() => {
    if (!hasResolvedPlayer1) return new Map<string, { label: string; rank: number }>()
    type EloRow = { elo: number; name: string; id: string }
    const latestEloByMemberId = new Map<string, number>()
    for (const match of seasonFilteredMatches) {
      // seasonFilteredMatches 는 최신 경기 우선 순서를 유지하므로, 멤버별 첫 유효 Elo가 최신값입니다.
      const p1Before = Number(match.player1EloBefore)
      const p1Delta = Number(match.player1EloDelta)
      if (
        !latestEloByMemberId.has(match.player1Id) &&
        Number.isFinite(p1Before) &&
        Number.isFinite(p1Delta)
      ) {
        latestEloByMemberId.set(match.player1Id, p1Before + p1Delta)
      }
      const p2Before = Number(match.player2EloBefore)
      const p2Delta = Number(match.player2EloDelta)
      if (
        !latestEloByMemberId.has(match.player2Id) &&
        Number.isFinite(p2Before) &&
        Number.isFinite(p2Delta)
      ) {
        latestEloByMemberId.set(match.player2Id, p2Before + p2Delta)
      }
    }

    const byTier = new Map<number, EloRow[]>()
    for (const member of members) {
      if (member.tier === null) continue
      const elo = latestEloByMemberId.get(member.id)
      if (elo === undefined) continue
      const arr = byTier.get(member.tier) ?? []
      arr.push({ id: member.id, name: member.name, elo })
      byTier.set(member.tier, arr)
    }

    const badgeById = new Map<string, { label: string; rank: number }>()
    for (const [tier, tierRows] of byTier.entries()) {
      tierRows
        .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name, "ko"))
        .slice(0, 5)
        .forEach((row, idx) => {
          const rank = idx + 1
          badgeById.set(row.id, {
            rank,
            label: rank === 1 ? `${tier}티어의 왕` : `${tier}티어 ${rank}등`,
          })
        })
    }
    return badgeById
  }, [hasResolvedPlayer1, seasonFilteredMatches, members])

  const localPlayerRecent20Matches = useMemo(() => {
    if (!hasResolvedPlayer1) return [] as Array<{ id: string; mapName: string; mapShort: string; isWin: boolean }>
    const rows = filteredMatches
      .map((match) => {
        const anchorId = anchorPlayerIdFromMatch(match, matchedPlayerIds)
        if (!anchorId) return null
        const mapName = match.mapName?.trim() || "미상"
        return {
          id: match.id,
          playedDate: match.playedDate,
          mapName,
          mapShort: mapName.slice(0, 2),
          isWin: match.winnerId === anchorId,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.playedDate.localeCompare(a.playedDate) || b.id.localeCompare(a.id))
      .slice(0, 20)
    return rows.map(({ id, mapName, mapShort, isWin }) => ({ id, mapName, mapShort, isWin }))
  }, [hasResolvedPlayer1, filteredMatches, matchedPlayerIds])

  const localPlayerRecent20Summary = useMemo(() => {
    const games = localPlayerRecent20Matches.length
    const wins = localPlayerRecent20Matches.filter((m) => m.isWin).length
    const losses = Math.max(0, games - wins)
    const winRate = games > 0 ? Number(((wins / games) * 100).toFixed(1)) : 0
    return { games, wins, losses, winRate }
  }, [localPlayerRecent20Matches])

  const localPlayerRecent20MapWins = useMemo(() => {
    const grouped = new Map<string, { mapName: string; games: number; wins: number; losses: number; winRate: number }>()
    for (const row of localPlayerRecent20Matches) {
      const prev = grouped.get(row.mapName) ?? { mapName: row.mapName, games: 0, wins: 0, losses: 0, winRate: 0 }
      prev.games += 1
      if (row.isWin) prev.wins += 1
      else prev.losses += 1
      grouped.set(row.mapName, prev)
    }
    return Array.from(grouped.values())
      .map((x) => ({ ...x, winRate: x.games > 0 ? Number(((x.wins / x.games) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.wins - a.wins || b.games - a.games || a.mapName.localeCompare(b.mapName, "ko"))
  }, [localPlayerRecent20Matches])

  const metaDayRaceTrend = serverDetail?.metaDayRaceTrend ?? localMetaDayRaceTrend
  const metaEloVolatilityRows = serverDetail?.metaEloVolatilityRows ?? localMetaEloVolatilityRows
  const versusEloTrend = serverDetail?.versusEloTrend ?? localVersusEloTrend
  const playerRecent20Matches = serverDetail?.recent20Matches ?? localPlayerRecent20Matches
  const playerRecent20Summary = serverDetail?.recent20Summary ?? localPlayerRecent20Summary
  const playerRecent20MapWins = serverDetail?.recent20MapWins ?? localPlayerRecent20MapWins

  const totalMatchCount = serverSummary?.totalMatchCount ?? filteredMatches.length
  const totalAllMatches = matches.length

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader
        isAdmin={headerData.isAdmin}
        isCreator={headerData.isCreator}
        isGuest={headerData.isGuest}
        loggedInUsername={headerData.loggedInUsername}
        adminUsernames={headerData.adminUsernames}
      />
      <div className="container mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
                <Database className="h-7 w-7 text-primary" />
                데이터센터
              </h1>
              <p className="text-sm text-muted-foreground">필터 상태를 URL로 공유할 수 있습니다.
                 </p>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5 text-foreground hover:text-foreground dark:hover:text-foreground"
              onClick={resetAllFilters}
            >
              <RotateCcw className="h-4 w-4" />
              필터 전체 초기화
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="player-filter-toggle" className="cursor-pointer">
                  상대전적 모드 전환
                </Label>
                <Switch
                  id="player-filter-toggle"
                  checked={playerFilterEnabled}
                  onCheckedChange={setPlayerFilterEnabled}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                켜면 선수/상대 기준 차트 모드로 전환됩니다.
              </p>
            </div>

            {playerFilterEnabled && (
              <>
                <div className="space-y-2">
                  <Label>선수1</Label>
                  <div className="relative">
                    <Input
                      placeholder="선수 이름 검색..."
                      value={playerQuery}
                      onChange={(e) => {
                        setPlayerQuery(e.target.value)
                        setPlayer1AutocompleteOpen(true)
                        setPlayer1AutocompleteActiveIndex(-1)
                      }}
                      onFocus={() => setPlayer1AutocompleteOpen(true)}
                      onKeyDown={(e) => {
                        if (player1AutocompleteOptions.length === 0) return
                        if (e.key === "ArrowDown") {
                          e.preventDefault()
                          setPlayer1AutocompleteOpen(true)
                          setPlayer1AutocompleteActiveIndex((prev) =>
                            prev < player1AutocompleteOptions.length - 1 ? prev + 1 : 0,
                          )
                          return
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault()
                          setPlayer1AutocompleteOpen(true)
                          setPlayer1AutocompleteActiveIndex((prev) =>
                            prev > 0 ? prev - 1 : player1AutocompleteOptions.length - 1,
                          )
                          return
                        }
                        if (e.key === "Enter" && player1AutocompleteOpen) {
                          const idx = player1AutocompleteActiveIndex
                          if (idx >= 0 && idx < player1AutocompleteOptions.length) {
                            e.preventDefault()
                            setPlayerQuery(player1AutocompleteOptions[idx])
                            setPlayer1AutocompleteOpen(false)
                            setPlayer1AutocompleteActiveIndex(-1)
                          }
                          return
                        }
                        if (e.key === "Escape") {
                          setPlayer1AutocompleteOpen(false)
                          setPlayer1AutocompleteActiveIndex(-1)
                        }
                      }}
                      onBlur={() => {
                        // 옵션 클릭(onMouseDown) 이후 자연스럽게 닫히도록 약간 지연
                        setTimeout(() => {
                          setPlayer1AutocompleteOpen(false)
                          setPlayer1AutocompleteActiveIndex(-1)
                        }, 120)
                      }}
                    />
                    {player1AutocompleteOpen && player1AutocompleteOptions.length > 0 && (
                      <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                        <ul className="max-h-56 overflow-y-auto py-1">
                          {player1AutocompleteOptions.map((name, idx) => (
                            <li key={name}>
                              <button
                                type="button"
                                className={cn(
                                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent hover:text-foreground dark:hover:text-foreground",
                                  player1AutocompleteActiveIndex === idx && "bg-accent text-foreground dark:text-foreground",
                                )}
                                onMouseEnter={() => setPlayer1AutocompleteActiveIndex(idx)}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  setPlayerQuery(name)
                                  setPlayer1AutocompleteOpen(false)
                                  setPlayer1AutocompleteActiveIndex(-1)
                                }}
                              >
                                <span className="truncate">{name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <MultiSelectFilter
                  label="선수2(단일 선택)"
                  options={player2Options.map((opt) => ({ value: opt.name, label: `${opt.name} (${opt.games}경기)` }))}
                  selectedValues={player2Queries}
                  onChange={(next) => {
                    const single = next.length === 0 ? [] : [next[next.length - 1]]
                    setPlayer2Queries(single)
                    if (single.length > 0) setPlayer2MenuOpen(false)
                  }}
                  open={player2MenuOpen}
                  onOpenChange={setPlayer2MenuOpen}
                  disabled={!hasResolvedPlayer1 || player2Options.length === 0}
                  placeholder={
                    !hasResolvedPlayer1
                      ? "먼저 선수1을 정확히 입력하세요"
                      : player2Options.length === 0
                        ? "해당 시즌 기준 상대 전적 없음"
                        : "전체 상대"
                  }
                />
              </>
            )}

            <MultiSelectFilter
              label="시즌"
              options={seasonOptions.map((s) => ({ value: s.id, label: s.label }))}
              selectedValues={seasonIds}
              onChange={onSeasonIdsChange}
              open={seasonMenuOpen}
              onOpenChange={setSeasonMenuOpen}
              placeholder="시즌 선택"
            />

            <MultiSelectFilter
              label={playerFilterEnabled ? "상대 종족" : "종족"}
              options={[
                { value: "T", label: "테란" },
                { value: "P", label: "프로토스" },
                { value: "Z", label: "저그" },
              ]}
              selectedValues={races}
              onChange={(next) => setRaces(next.filter((v): v is Race => v === "T" || v === "P" || v === "Z"))}
              open={raceMenuOpen}
              onOpenChange={setRaceMenuOpen}
              placeholder={playerFilterEnabled ? "전체 상대 종족" : "전체 종족"}
            />

            <MultiSelectFilter
              label={playerFilterEnabled ? "상대 티어" : "티어"}
              options={tierOptions}
              selectedValues={tiers}
              onChange={setTiers}
              open={tierMenuOpen}
              onOpenChange={setTierMenuOpen}
              placeholder={playerFilterEnabled ? "전체 상대 티어" : "전체 티어"}
            />

            <MultiSelectFilter
              label="맵"
              options={mapOptions.map((option) => ({ value: option, label: option }))}
              selectedValues={mapNames}
              onChange={setMapNames}
              open={mapMenuOpen}
              onOpenChange={setMapMenuOpen}
              placeholder="전체 맵"
            />

            <MultiSelectFilter
              label="경기 유형"
              options={matchTypeOptions.map((option) => ({ value: option, label: option }))}
              selectedValues={matchTypes}
              onChange={setMatchTypes}
              open={matchTypeMenuOpen}
              onOpenChange={setMatchTypeMenuOpen}
              placeholder="전체 경기 유형"
            />

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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>날짜 필터</Label>
                <span className="text-xs text-muted-foreground">
                  {recentDays === 0 ? "전체 날짜" : `최근 ${recentDays}일`}
                </span>
              </div>
              <Slider
                min={0}
                max={maxRecentDays}
                step={1}
                value={[recentDays]}
                onValueChange={(v) => setRecentDays(v[0] ?? 0)}
              />
              <p className="text-xs text-muted-foreground">0이면 전체, 1 이상은 최근 N일 데이터만 반영합니다.</p>
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 3, 7, 14, 30]
                  .filter((d) => d === 0 || d <= maxRecentDays)
                  .map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      variant={recentDays === d ? "default" : "outline"}
                      onClick={() => setRecentDays(d)}
                      className="h-7 px-2 text-[11px]"
                    >
                      {d === 0 ? "전체" : `${d}일`}
                    </Button>
                  ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {!playerFilterEnabled && (
          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {metaDonutStats.map((item) => {
              const donutData = [
                { name: "win", value: Math.max(0, Math.min(100, item.winRate)), fill: raceColors[item.race] },
                { name: "rest", value: Math.max(0, 100 - item.winRate), fill: "hsl(220 14% 24%)" },
              ]
              return (
                <Card key={item.race}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{raceNames[item.race]}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center">
                    <div className="relative h-[150px] w-[150px]">
                      <PieChart width={150} height={150}>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          startAngle={90}
                          endAngle={-270}
                          innerRadius={46}
                          outerRadius={62}
                          stroke="hsl(220 14% 32%)"
                          strokeWidth={1}
                        >
                          {donutData.map((d) => (
                            <Cell key={d.name} fill={d.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold" style={{ color: raceColors[item.race] }}>{item.winRate}%</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">표본 {item.games.toLocaleString()}경기</p>
                  </CardContent>
                </Card>
              )
            })}
          </section>
        )}

        {playerFilterEnabled && (
          <section className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {[
              { title: "선수1", data: player1CardStats, icon: <User className="h-4 w-4" />, accent: "from-sky-500/20 to-transparent", orderClass: "xl:order-1" },
              { title: "선수2", data: player2CardStats, icon: <Swords className="h-4 w-4" />, accent: "from-violet-500/20 to-transparent", orderClass: "xl:order-3" },
            ].map(({ title, data, icon, accent, orderClass }) => (
              <Card
                key={title}
                className={cn(
                  "relative overflow-hidden",
                  data.member && tierRankBadgeByMemberId.get(data.member.id)?.rank === 1 && "border-yellow-400/85 shadow-[0_0_18px_rgba(250,204,21,0.32)]",
                  orderClass,
                )}
              >
                {data.member && tierRankBadgeByMemberId.get(data.member.id)?.rank === 1 && (
                  <>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-[-34px] top-2 rotate-[24deg] border-y border-yellow-700/40 bg-gradient-to-r from-yellow-300/95 to-yellow-200/95 px-8 py-0.5 text-[10px] font-extrabold tracking-wide text-yellow-950 shadow-[0_0_10px_rgba(250,204,21,0.35)]"
                    >
                      TIER CHAMPION
                    </span>
                  </>
                )}
                <div className={cn("h-1 w-full bg-gradient-to-r", accent)} />
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {icon}
                    {title}
                  </CardTitle>
                  <CardDescription>
                    {data.member ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          {tierRankBadgeByMemberId.get(data.member.id)?.rank === 1 && (
                            <Crown className="h-3.5 w-3.5 text-yellow-500 animate-pulse" aria-hidden />
                          )}
                          {data.member.name}
                        </span>
                        <Badge variant="outline" className={cn("text-[11px] font-semibold", raceTagClasses[data.member.race])}>
                          {raceNames[data.member.race]}
                        </Badge>
                        {data.member.tier ? (
                          <Badge
                            variant="outline"
                            className={cn("px-1.5 py-0 text-[11px] font-semibold", tierTagClasses[data.member.tier])}
                          >
                            {data.member.tier}티어
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">티어 -</span>
                        )}
                        {title === "선수2" && nemesis && (
                          <Badge
                            variant="outline"
                            className="border-rose-300 bg-rose-100 px-1.5 py-0 text-[11px] font-bold text-rose-700 dark:border-rose-500/60 dark:bg-rose-500/15 dark:text-rose-400"
                            title={`선수1 기준 천적 · 승률 ${nemesis.winRate}% (${nemesis.games}G)`}
                          >
                            천적
                          </Badge>
                        )}
                        {title === "선수2" && data.member && rivalTopRankById.has(data.member.id) && (
                          <Badge
                            variant="outline"
                            className="border-indigo-300 bg-indigo-100 px-1.5 py-0 text-[11px] font-bold text-indigo-700 dark:border-indigo-500/60 dark:bg-indigo-500/15 dark:text-indigo-300"
                            title={`선수1 기준 호적수 TOP${rivalTopRankById.get(data.member.id)}`}
                          >
                            호적수
                          </Badge>
                        )}
                        {data.member && tierRankBadgeByMemberId.has(data.member.id) && (() => {
                          const tierBadge = tierRankBadgeByMemberId.get(data.member.id)
                          if (!tierBadge) return null
                          const rankTone =
                            tierBadge.rank === 1
                              ? "border-yellow-300 bg-yellow-100 text-yellow-700 dark:border-yellow-500/70 dark:bg-yellow-500/18 dark:text-yellow-300"
                              : tierBadge.rank === 2
                                ? "border-red-300 bg-red-100 text-red-700 dark:border-red-500/70 dark:bg-red-500/18 dark:text-red-300"
                                : tierBadge.rank === 3
                                  ? "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/70 dark:bg-violet-500/18 dark:text-violet-300"
                                  : tierBadge.rank === 4
                                    ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/70 dark:bg-emerald-500/18 dark:text-emerald-300"
                                    : "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-500/70 dark:bg-sky-500/18 dark:text-sky-300"
                          return (
                            <Badge
                              variant="outline"
                              className={cn("px-1.5 py-0 text-[11px] font-bold", rankTone)}
                              title="현재 시즌 필터 기준 티어 내 Elo 랭킹"
                            >
                              {tierBadge.label}
                            </Badge>
                          )
                        })()}
                        {data.member &&
                          (decorativeByMember[data.member.id] ?? []).map((db) => (
                            <Badge
                              key={db.id}
                              variant="outline"
                              className={decorativeBadgeAccentClasses(db.accent)}
                              title="리그·대회 전역 뱃지"
                            >
                              {db.label}
                            </Badge>
                          ))}
                      </span>
                    ) : (
                      "검색된 선수가 없습니다."
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {title === "선수2" && needsPlayer2Selection ? (
                    <div
                      className="rounded-md border border-dashed border-border bg-muted/25 px-3 py-4 text-center text-sm text-muted-foreground"
                      title="상대 선수(선수2)를 선택하면 전적 요약이 표시됩니다."
                    >
                      <p className="mb-3">상대 선수를 입력해주세요.</p>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {player2Options.slice(0, 5).map((opt) => (
                          <Button
                            key={`quick-p2-${opt.name}`}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs text-foreground hover:text-foreground dark:hover:text-foreground"
                            onClick={() => {
                              setPlayer2Queries([opt.name])
                              setPlayer2MenuOpen(false)
                            }}
                          >
                            {opt.name} ({opt.games})
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-md border border-border p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">전체 승률</p>
                          <p className="font-semibold">{data.winRate}%</p>
                        </div>
                        <Progress value={data.winRate} className="h-1.5" />
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {data.wins.toLocaleString()}승 / {Math.max(0, data.games - data.wins).toLocaleString()}패 · 총 {data.games.toLocaleString()}경기
                        </p>
                      </div>
                      {[
                        { k: "저그전", v: data.vsZ, c: "bg-red-500" },
                        { k: "테란전", v: data.vsT, c: "bg-sky-500" },
                        { k: "토스전", v: data.vsP, c: "bg-amber-400" },
                      ].map((item) => (
                        <div key={item.k} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{item.k} 승률</span>
                            <span className="font-medium">{item.v}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", item.c)} style={{ width: `${Math.max(0, Math.min(100, item.v))}%` }} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}

            <Card className="overflow-hidden xl:order-2">
              <div className="h-1 w-full bg-gradient-to-r from-rose-500/20 via-orange-500/20 to-transparent" />
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Swords className="h-4 w-4" />
                  상대전적 (선수1 기준)
                </CardTitle>
                <CardDescription>현재 적용된 필터 전체(시즌/유형/맵/날짜/종족) 기준 선수1 vs 선수2 맞대결 요약</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {needsPlayer2Selection ? (
                  <div
                    className="rounded-md border border-dashed border-border bg-muted/25 px-3 py-6 text-center text-sm text-muted-foreground"
                    title="상대 선수(선수2)를 선택하면 상대전적과 위험도가 표시됩니다."
                  >
                    상대 선수를 입력해주세요.
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border border-border p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">상대전적 승률</p>
                        <p className="font-semibold">{headToHeadStats.winRate}%</p>
                      </div>
                      <Progress value={headToHeadStats.winRate} className="h-1.5" />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {headToHeadStats.wins}승 {headToHeadStats.losses}패 · 총 {headToHeadStats.games}경기
                      </p>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span className="text-xs text-muted-foreground">위험도</span>
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", headToHeadRisk.tone)}>{headToHeadRisk.label}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {playerFilterEnabled && hasResolvedPlayer1 && (
          <section className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  최근 20게임 승/패 (
                  {player1CardStats.member?.name ?? (activePlayerQuery.trim() || "선수1")}
                  {isHeadToHeadMode
                    ? ` vs ${player2CardStats.member?.name ?? activePlayer2Queries[0] ?? "선수2"}`
                    : ""}
                  )
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">경기수</p>
                    <p className="text-lg font-semibold">{playerRecent20Summary.games}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">승</p>
                    <p className="text-lg font-semibold text-emerald-400">{playerRecent20Summary.wins}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">패</p>
                    <p className="text-lg font-semibold text-rose-400">{playerRecent20Summary.losses}</p>
                  </div>
                  <div className="rounded-md border border-border bg-card px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">승률</p>
                    <p className="text-lg font-semibold">{playerRecent20Summary.winRate}%</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">최근 20경기 시트 (승=초록 / 패=빨강)</p>
                    <div className="grid grid-cols-10 gap-1.5">
                      {Array.from({ length: 20 }, (_, idx) => {
                        const row = playerRecent20Matches[idx]
                        if (!row) {
                          return <div key={`empty-${idx}`} className="h-8 rounded-md border border-border/50 bg-muted/40" />
                        }
                        return (
                          <div
                            key={row.id}
                            className={cn(
                              "flex h-8 items-center justify-center rounded-md border text-[11px] font-semibold",
                              row.isWin
                                ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-300"
                                : "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-400/60 dark:bg-rose-500/20 dark:text-rose-300",
                            )}
                            title={`${row.mapName} · ${row.isWin ? "승" : "패"}`}
                          >
                            {row.mapShort}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    {playerRecent20MapWins.length === 0 ? (
                      <div className="flex h-[220px] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
                        맵별 승수 차트를 그릴 데이터가 없습니다.
                      </div>
                    ) : (
                      <ChartContainer
                        className="h-[250px] w-full"
                        config={{
                          wins: { label: "승수", color: "hsl(142 76% 45%)" },
                        }}
                      >
                        <BarChart data={playerRecent20MapWins} margin={{ left: 8, right: 12, top: 22, bottom: 10 }}>
                          <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/60" />
                          <XAxis dataKey="mapName" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(0, 2)} />
                          <YAxis allowDecimals={false} domain={[0, "dataMax + 1"]} />
                          <Tooltip
                            cursor={{ fill: "hsl(var(--muted) / 0.2)" }}
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) return null
                              const p = payload[0]?.payload as
                                | { mapName: string; games: number; wins: number; losses: number; winRate: number }
                                | undefined
                              if (!p) return null
                              return (
                                <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                                  <p className="font-medium text-foreground">{p.mapName}</p>
                                  <p className="text-muted-foreground">경기수 {p.games} · 승 {p.wins} · 패 {p.losses}</p>
                                  <p className="text-muted-foreground">승률 {p.winRate}%</p>
                                </div>
                              )
                            }}
                          />
                          <Bar dataKey="wins" name="wins" fill="hsl(142 76% 45%)" radius={[6, 6, 0, 0]}>
                            <LabelList dataKey="wins" position="top" className="fill-muted-foreground text-[10px]" />
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        <section>
          {isPlayerModePendingInput && (
            <div className="mb-2 flex items-center justify-start">
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/16 dark:text-amber-300"
              >
                선수1 입력 대기
              </Badge>
            </div>
          )}
          <div
            className={cn(
              "grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch",
              usePlayer1Charts && "xl:grid-cols-3",
              isPlayerModePendingInput && "opacity-60",
            )}
          >
          <Card className={cn("flex h-full flex-col", usePlayer1Charts && "xl:col-span-1")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Percent className="h-4 w-4" />
                {usePlayer1Charts
                  ? `${playerChartLabel} · 상대 종족별 승패 비율`
                  : `${raceNames[metaAnchorRace]} 기준 · 상대 종족별 승률 · 경기 수`}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {!usePlayer1Charts && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {raceOrder.map((race) => (
                    <Button
                      key={race}
                      type="button"
                      size="sm"
                      variant={metaAnchorRace === race ? "default" : "outline"}
                      onClick={() => setMetaAnchorRace(race)}
                    >
                      {raceNames[race]}
                    </Button>
                  ))}
                </div>
              )}
              {raceWinRates.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {playerFilterEnabled && !hasResolvedPlayer1
                    ? "선수1 이름을 검색하면 선수 기준 차트로 바뀝니다."
                    : "최소 경기 수 조건을 만족하는 종족 데이터가 없습니다."}
                </div>
              ) : (
                <ChartContainer
                  className={cn("w-full", usePlayer1Charts ? "h-[260px]" : "h-[340px]")}
                  config={{
                    wins: { label: "승", color: "hsl(142 76% 45%)" },
                    losses: { label: "패", color: "hsl(358 90% 67%)" },
                  }}
                >
                  <BarChart data={raceStackChartData} margin={{ left: 8, right: 12, top: 18, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="2 4" className="stroke-border/60" />
                    <XAxis dataKey="xLabel" tick={{ fontSize: 11 }} />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, "dataMax + 2"]}
                      tickFormatter={(v) => `${v}`}
                      label={{ value: "경기 수", angle: -90, position: "insideLeft", offset: 2, style: { fontSize: 10 } }}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.25)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const p = payload[0]?.payload as
                          | { race: Race; games: number; wins: number; losses: number; winRate: number }
                          | undefined
                        if (!p) return null
                        return (
                          <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                            <p className="font-medium text-foreground">{`vs ${raceNames[p.race]}`}</p>
                            <p className="text-muted-foreground">경기수 {p.games} · 승 {p.wins} · 패 {p.losses}</p>
                            <p className="text-muted-foreground">승률 {p.winRate}%</p>
                          </div>
                        )
                      }}
                    />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                    <Bar
                      dataKey="wins"
                      name="승"
                      fill="hsl(142 76% 45%)"
                      stackId="raceStack"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={88}
                    >
                      <Cell fill="hsl(142 76% 45%)" />
                      <Cell fill="hsl(142 76% 45%)" />
                      <Cell fill="hsl(142 76% 45%)" />
                      <LabelList dataKey="winRateLabel" position="center" className="fill-white text-xs font-bold" />
                    </Bar>
                    <Bar
                      dataKey="losses"
                      name="패"
                      fill="hsl(358 90% 67%)"
                      stackId="raceStack"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={88}
                    >
                      <Cell fill="hsl(358 90% 67%)" />
                      <Cell fill="hsl(358 90% 67%)" />
                      <Cell fill="hsl(358 90% 67%)" />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {usePlayer1Charts && (
            <Card className="flex h-full flex-col xl:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-4 w-4" />
                  종족별 경기수 분포
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-center">
                {mapRaceGamesTotal === 0 ? (
                  <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                    종족 데이터 없음
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="relative w-fit">
                      <PieChart width={190} height={190}>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null
                            const p = payload[0]?.payload as { label: string; games: number } | undefined
                            if (!p) return null
                            return (
                              <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                                <p className="font-medium text-foreground">{p.label}</p>
                                <p className="text-muted-foreground">경기수 : {p.games}</p>
                              </div>
                            )
                          }}
                        />
                        <Pie
                          data={mapRaceGamesDonutData}
                          dataKey="games"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          stroke="#0f172a"
                          strokeWidth={2}
                          labelLine={false}
                          label={({ percent, cx, cy, midAngle, innerRadius, outerRadius }) => {
                            if (
                              typeof percent !== "number" ||
                              typeof cx !== "number" ||
                              typeof cy !== "number" ||
                              typeof midAngle !== "number" ||
                              typeof innerRadius !== "number" ||
                              typeof outerRadius !== "number"
                            ) {
                              return null
                            }
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.55
                            const rad = Math.PI / 180
                            const x = cx + radius * Math.cos(-midAngle * rad)
                            const y = cy + radius * Math.sin(-midAngle * rad)
                            return (
                              <text
                                x={x}
                                y={y}
                                fill="#ffffff"
                                textAnchor="middle"
                                dominantBaseline="central"
                                className="text-[10px] font-semibold"
                              >
                                {(percent * 100).toFixed(1)}%
                              </text>
                            )
                          }}
                        >
                          {mapRaceGamesDonutData.map((row) => (
                            <Cell key={`map-race-donut-card-${row.race}`} fill={row.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xs text-muted-foreground">총 경기</span>
                        <span className="text-lg font-bold text-foreground">{mapRaceGamesTotal}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-sm">
                      {mapRaceGamesDonutData.map((row) => (
                        <div key={`map-race-legend-card-${row.race}`} className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.fill }} aria-hidden />
                          <span>{row.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className={cn("flex h-full flex-col", usePlayer1Charts && "xl:col-span-1")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-4 w-4" />
                {usePlayer1Charts ? `${playerChartLabel} · 맵별 승률 차트` : "맵별 종족 승률"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usePlayer1Charts ? (
                sortedPlayerMapMasteryData.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    {hasResolvedPlayer1
                      ? "최소 경기 수 조건을 만족하는 맵 데이터가 없습니다."
                      : "선수1 이름을 검색하면 맵별 승률이 표시됩니다."}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant={mapChartSort === "gamesDesc" ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "h-7 px-2 text-xs",
                          mapChartSort !== "gamesDesc" && "text-foreground hover:text-foreground dark:hover:text-foreground",
                        )}
                        onClick={() => setMapChartSort("gamesDesc")}
                      >
                        경기수순
                      </Button>
                      <Button
                        type="button"
                        variant={mapChartSort === "winRateDesc" ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "h-7 px-2 text-xs",
                          mapChartSort !== "winRateDesc" && "text-foreground hover:text-foreground dark:hover:text-foreground",
                        )}
                        onClick={() => setMapChartSort("winRateDesc")}
                      >
                        승률순
                      </Button>
                    </div>
                    <div
                      className={cn(
                        "space-y-4",
                        sortedPlayerMapMasteryData.length > 4 && "max-h-[235px] overflow-y-auto pr-2",
                      )}
                    >
                      {sortedPlayerMapMasteryData.map((row) => {
                        const winRate = Math.max(0, Math.min(100, row.p1WinRate))
                        const loseRate = Math.max(0, 100 - winRate)
                        return (
                          <div key={row.map} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <p className="min-w-0 truncate pr-2 text-sm font-semibold text-foreground">{row.map}</p>
                              <p className="shrink-0 font-mono text-sm font-semibold text-foreground">
                                {winRate.toFixed(winRate % 1 === 0 ? 0 : 1)}%{" "}
                                <span className="text-xs text-muted-foreground">({row.p1Games})</span>
                              </p>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted/70">
                              <div className="flex h-full w-full">
                                <div className="h-full bg-emerald-500" style={{ width: `${winRate}%` }} aria-hidden />
                                <div className="h-full bg-rose-500" style={{ width: `${loseRate}%` }} aria-hidden />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              ) : metaMapRaceWinRates.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  최소 경기 수 조건을 만족하는 맵 데이터가 없습니다.
                </div>
              ) : (
                <ChartContainer className="h-[340px] w-full" config={chartConfig}>
                  <ScatterChart margin={{ left: 16, right: 14, top: 20, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/60" />
                    <XAxis type="number" dataKey="winRate" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="map" name="맵" width={90} />
                    {metaMapRows.map((map) => (
                      <ReferenceLine key={`row-${map}`} y={map} stroke="#94a3b8" strokeOpacity={0.65} strokeDasharray="2 5" />
                    ))}
                    <ReferenceLine
                      x={50}
                      stroke="#c084fc"
                      strokeDasharray="3 3"
                      strokeWidth={2.2}
                      ifOverflow="extendDomain"
                    />
                    <Tooltip
                      shared={false}
                      cursor={false}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const p = payload[0]?.payload as { map: string; winRate: number; games: number; race: Race } | undefined
                        if (!p) return null
                        return (
                          <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                            <div className="mb-1 font-medium">{p.map}</div>
                            <div className="flex items-center justify-between gap-3">
                              <span>{raceNames[p.race]}</span>
                              <span className="font-mono">
                                {p.winRate}% <span className="text-muted-foreground">(경기수 : {p.games})</span>
                              </span>
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                    <Scatter data={metaMapDotSeries.T} name="T" fill={raceColors.T} shape={makeRaceDotShape("T")} />
                    <Scatter data={metaMapDotSeries.P} name="P" fill={raceColors.P} shape={makeRaceDotShape("P")} />
                    <Scatter data={metaMapDotSeries.Z} name="Z" fill={raceColors.Z} shape={makeRaceDotShape("Z")} />
                  </ScatterChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          </div>
        </section>

        {!usePlayer1Charts && (
          <section className="mt-4 grid grid-cols-1 gap-4">
            <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="h-4 w-4" />
                    ELO 변동성 분석
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metaEloVolatilityRows.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      최근 7일 ELO 기록이 충분한 유저가 없습니다.
                    </div>
                  ) : (
                    <ChartContainer
                      className="h-[360px] w-full"
                      config={{
                        drawdown: { label: "최고점 대비 현재 하락폭", color: "hsl(20 90% 58%)" },
                        rangeRemainder: { label: "변동폭 잔여(변동폭-하락폭)", color: "hsl(220 88% 60%)" },
                      }}
                    >
                      <BarChart
                        data={metaEloVolatilityRows}
                        layout="vertical"
                        margin={{ left: 40, right: 18, top: 10, bottom: 8 }}
                      >
                        <CartesianGrid horizontal={false} strokeDasharray="2 4" className="stroke-border/60" />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => `${v}`}
                          label={{ value: "ELO 값", position: "insideBottomRight", offset: -2, style: { fontSize: 10 } }}
                        />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                        <Legend
                          verticalAlign="top"
                          height={28}
                          wrapperStyle={{ fontSize: 11 }}
                          iconSize={10}
                          formatter={(value) =>
                            value === "rangeRemainder"
                              ? "변동폭 잔여(변동폭-하락폭)"
                              : value === "drawdown"
                                ? "최고점 대비 현재 하락폭"
                                : String(value)
                          }
                        />
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted) / 0.2)" }}
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null
                            const p = payload[0]?.payload as
                              | {
                                  name: string
                                  games: number
                                  currentElo: number
                                  peakElo: number
                                  troughElo: number
                                  range: number
                                  drawdown: number
                                  rangeRemainder: number
                                }
                              | undefined
                            if (!p) return null
                            return (
                              <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                                <p className="font-medium text-foreground">{p.name}</p>
                                <p className="text-muted-foreground">변동폭: {p.range.toFixed(1)} (최고 {p.peakElo.toFixed(1)} / 최저 {p.troughElo.toFixed(1)})</p>
                                <p className="text-muted-foreground">현재 하락폭: {p.drawdown.toFixed(1)} (현재 {p.currentElo.toFixed(1)})</p>
                                <p className="text-muted-foreground">표본: {p.games}경기</p>
                              </div>
                            )
                          }}
                        />
                        <Bar
                          dataKey="rangeRemainder"
                          name="rangeRemainder"
                          radius={[0, 6, 6, 0]}
                          fill="hsl(220 88% 60%)"
                          fillOpacity={0.85}
                          barSize={14}
                          stackId="volatility"
                        >
                          <LabelList
                            dataKey="rangeRemainder"
                            position="right"
                            offset={6}
                            formatter={(v: number) => (v > 0 ? `${v.toFixed(0)}` : "")}
                            className="fill-blue-200 text-[10px]"
                          />
                        </Bar>
                        <Bar
                          dataKey="drawdown"
                          name="drawdown"
                          radius={[0, 6, 6, 0]}
                          fill="hsl(20 90% 58%)"
                          fillOpacity={0.95}
                          stroke="#111827"
                          strokeWidth={0.8}
                          barSize={14}
                          stackId="volatility"
                        >
                          <LabelList
                            dataKey="drawdown"
                            position="right"
                            offset={8}
                            formatter={(v: number) => (v > 0 ? `${v.toFixed(0)}` : "")}
                            className="fill-orange-200 text-[10px]"
                          />
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  )}
                </CardContent>
            </Card>
          </section>
        )}

        <section className="mt-4">
          {isPlayerModePendingInput && (
            <div className="mb-2 flex items-center justify-start">
              <Badge
                variant="outline"
                className="border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/60 dark:bg-amber-500/16 dark:text-amber-300"
              >
                선수1 입력 대기
              </Badge>
            </div>
          )}
          <div className={cn("grid grid-cols-1 gap-4", usePlayer1Charts && "xl:grid-cols-10", isPlayerModePendingInput && "opacity-60")}>
          {usePlayer1Charts && (
            <Card className="xl:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-4 w-4" />
                  {playerChartLabel} · 맵별 승률 레이더
                </CardTitle>
              </CardHeader>
              <CardContent>
                {playerMapMasteryData.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    비교 가능한 맵 데이터가 없습니다. (데이터가 없는 맵은 자동 제외)
                  </div>
                ) : (
                  <ChartContainer
                    className="h-[300px] w-full"
                    config={{
                      p1WinRate: { label: player1CardStats.member?.name ?? "선수1", color: "hsl(280 90% 65%)" },
                      compareWinRate: {
                        label: isHeadToHeadMode
                          ? (player2CardStats.member?.name ?? "선수2")
                          : "클랜 평균",
                        color: isHeadToHeadMode ? "hsl(8 90% 62%)" : "hsl(196 90% 48%)",
                      },
                    }}
                  >
                    <RadarChart data={playerMapMasteryData} outerRadius="68%">
                      <defs>
                        <radialGradient id="radarGradientP1" cx="50%" cy="50%" r="70%">
                          <stop offset="0%" stopColor="#c026d3" stopOpacity={0.08} />
                          <stop offset="100%" stopColor="#c026d3" stopOpacity={0.28} />
                        </radialGradient>
                        <radialGradient id="radarGradientCmp" cx="50%" cy="50%" r="70%">
                          <stop
                            offset="0%"
                            stopColor={isHeadToHeadMode ? "#ef4444" : "#06b6d4"}
                            stopOpacity={0.07}
                          />
                          <stop
                            offset="100%"
                            stopColor={isHeadToHeadMode ? "#ef4444" : "#06b6d4"}
                            stopOpacity={0.22}
                          />
                        </radialGradient>
                      </defs>
                      <PolarGrid stroke="hsl(var(--border) / 0.75)" />
                      <PolarAngleAxis
                        dataKey="map"
                        tick={{ fontSize: 9 }}
                        tickFormatter={(value: string) => (value.length > 6 ? `${value.slice(0, 6)}…` : value)}
                      />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickCount={6} />
                      <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null
                          const p = payload[0]?.payload as
                            | {
                                map: string
                                p1Wins: number
                                p1Losses: number
                                p1WinRate: number
                                p1Games: number
                                compareWins: number
                                compareLosses: number
                                compareWinRate: number
                                compareGames: number
                              }
                            | undefined
                          if (!p) return null
                          const p1Name = player1CardStats.member?.name ?? "선수1"
                          const compareName = isHeadToHeadMode
                            ? (player2CardStats.member?.name ?? "선수2")
                            : "클랜 평균"
                          return (
                            <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                              <p className="font-medium text-foreground">{p.map}</p>
                              <p className="text-muted-foreground">
                                {p1Name}: {p.p1Wins}승{p.p1Losses}패 ({p.p1WinRate}%)
                              </p>
                              <p className="text-muted-foreground">
                                {compareName}: {p.compareWins}승{p.compareLosses}패 ({p.compareWinRate}%)
                              </p>
                            </div>
                          )
                        }}
                      />
                      <Radar
                        name={player1CardStats.member?.name ?? "선수1"}
                        dataKey="p1WinRate"
                        stroke="#c026d3"
                        fill="url(#radarGradientP1)"
                        strokeWidth={2.8}
                        dot={{ r: 3.5, fill: "#d946ef", stroke: "#000000", strokeWidth: 1.5 }}
                        isAnimationActive={false}
                      />
                      <Radar
                        name={isHeadToHeadMode ? (player2CardStats.member?.name ?? "선수2") : "클랜 평균"}
                        dataKey="compareWinRate"
                        stroke={isHeadToHeadMode ? "#ef4444" : "#06b6d4"}
                        fill="url(#radarGradientCmp)"
                        strokeWidth={2.6}
                        dot={{
                          r: 3.3,
                          fill: isHeadToHeadMode ? "#fb7185" : "#22d3ee",
                          stroke: "#000000",
                          strokeWidth: 1.4,
                        }}
                        isAnimationActive={false}
                      />
                    </RadarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          )}
          <Card className={cn(usePlayer1Charts && "xl:col-span-7")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LineChartIcon className="h-4 w-4" />
                {usePlayer1Charts ? `${playerChartLabel} · 일자별 Elo 점수` : "일자별 종족 승률 추이"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(usePlayer1Charts ? versusEloTrend.length === 0 : metaDayRaceTrend.length === 0) ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {usePlayer1Charts
                    ? hasResolvedPlayer1
                      ? "이 조건에서 Elo 점수가 기록된 일자 데이터가 없습니다."
                      : "선수1 이름을 검색하면 Elo 추이가 표시됩니다."
                    : "일자별 추이를 그릴 수 있는 데이터가 없습니다."}
                </div>
              ) : usePlayer1Charts ? (
                <ChartContainer className="h-[320px] w-full" config={eloWeekChartConfig}>
                  <LineChart data={versusEloTrend} margin={{ left: 8, right: 10, top: 16, bottom: 8 }}>
                    <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.65} strokeDasharray="2 5" />
                    <XAxis dataKey="weekLabel" interval={0} angle={-25} height={52} textAnchor="end" />
                    <YAxis
                      domain={["dataMin - 15", "dataMax + 15"]}
                      width={52}
                      tickFormatter={(v) => String(v)}
                    />
                    <Tooltip content={<ChartTooltipContent />} formatter={(value) => [`${value}`, "Elo 점수"]} />
                    <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                    <Line
                      type="linear"
                      dataKey="p1Elo"
                      name={player1CardStats.member?.name ?? "선수1"}
                      stroke={ELO_WEEK_LINE_COLOR}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={{
                        r: 5,
                        fill: ELO_WEEK_DOT_FILL,
                        stroke: ELO_WEEK_DOT_RING,
                        strokeWidth: 2.8,
                      }}
                      activeDot={{
                        r: 6.5,
                        fill: ELO_WEEK_DOT_FILL,
                        stroke: ELO_WEEK_DOT_RING,
                        strokeWidth: 3,
                      }}
                      isAnimationActive={false}
                      connectNulls
                    />
                    {isHeadToHeadMode && (
                      <Line
                        type="linear"
                        dataKey="p2Elo"
                        name={player2CardStats.member?.name ?? "선수2"}
                        stroke="#ef4444"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        dot={{
                          r: 5,
                          fill: "#f87171",
                          stroke: "#000000",
                          strokeWidth: 2.8,
                        }}
                        activeDot={{
                          r: 6.5,
                          fill: "#f87171",
                          stroke: "#000000",
                          strokeWidth: 3,
                        }}
                        isAnimationActive={false}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ChartContainer>
              ) : (
                <ChartContainer className="h-[320px] w-full" config={chartConfig}>
                  <LineChart data={metaDayRaceTrend} margin={{ left: 8, right: 10, top: 8, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="2 4" className="stroke-border/60" />
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
          </div>
        </section>

        

        <section className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">선수 수 (시즌 필터 기준)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{seasonPlayerCount.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {seasonIds.length === 0
                  ? "전체 로드 경기에 출전한 서로 다른 선수"
                  : seasonIds.length === 1 && PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[seasonIds[0]]
                    ? `${PROLEAGUE_MATCH_TYPE_BY_SEASON_OPTION[seasonIds[0]]} 경기에 출전한 서로 다른 선수`
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
